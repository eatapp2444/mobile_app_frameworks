import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { parseAppLink } from './appLinks';
import { useConfig, useTheme } from './ConfigProvider';
import {
  CMS_HTML_CACHE_MODE,
  htmlViewNavDecision,
  htmlViewSourceChanged,
  resolveHtmlBaseUrl,
  shouldConsumeAndroidBack,
} from './htmlViewPolicy';
import { SCREEN_FADE_DURATION_MS } from './screenTransitions';
import { useTabActions } from './TabActions';

const SYSTEM_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", system-ui, sans-serif';

type ThemeTokens = ReturnType<typeof useTheme>;

function buildHtmlDocument(html: string, theme: ThemeTokens) {
  return `<!doctype html><html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
<style>
  :root {
    --primary: ${theme.primary};
    --background: ${theme.background};
    --card: ${theme.card};
    --text: ${theme.text};
    --text-secondary: ${theme.textSecondary};
    --border: ${theme.border};
    --radius: ${theme.cardRadius}px;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; padding: 0; min-height: 100%; background: var(--background); color: var(--text);
    font-family: ${theme.fontStack ?? SYSTEM_STACK}; -webkit-font-smoothing: antialiased; }
  img { max-width: 100%; height: auto; display: block; }
  a { color: var(--primary); }
  iframe { width: 100%; border: 0; }
</style>
<script>
(function () {
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.slice(0, 7).toLowerCase() !== 'eatapp:') return;
    e.preventDefault();
    e.stopPropagation();
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'eatapp', url: href }));
    }
  }, true);
})();
</script>
</head><body>${html}</body></html>`;
}

function useAndroidWebViewBack(ref: React.RefObject<WebView | null>, enabled: boolean) {
  const canGoBack = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!shouldConsumeAndroidBack(canGoBack.current, enabled)) return false;
      ref.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, [enabled, ref]);

  return {
    onNavigationStateChange: (nav: { canGoBack?: boolean }) => {
      canGoBack.current = !!nav.canGoBack;
    },
  };
}

/**
 * Renders CMS HTML (home sections, page-builder pages) exactly like the
 * dashboard preview: same font stack, same theme tokens.
 *
 * The page background stays visible until `onLoadEnd`, then the WebView fades
 * in. This cover is keep-alive only (stack animation is `none` on tab routes)
 * so it does not double-fade with overlay screen transitions. `baseUrl` is the
 * client's https origin so WKWebView/Android can cache images.
 */
export const HtmlView = React.memo(function HtmlView({
  html,
  active = true,
}: {
  html: string;
  active?: boolean;
}) {
  const theme = useTheme();
  const { config } = useConfig();
  const router = useRouter();
  const { activateTab } = useTabActions();
  const cover = useRef(new Animated.Value(1)).current;

  const runAppLink = useCallback(
    (url: string) => {
      const action = parseAppLink(url);
      if (action.type === 'open-tab') activateTab(action.name);
    },
    [activateTab],
  );
  const documentLoaded = useRef(false);
  const sourceRef = useRef<{ html: string; baseUrl: string } | null>(null);
  const webRef = useRef<WebView>(null);
  const androidBack = useAndroidWebViewBack(webRef, active);

  const baseUrl = useMemo(
    () =>
      resolveHtmlBaseUrl({
        webviewUrl: (config?.webview as { url?: string } | undefined)?.url,
        domain: config?.app?.domain,
        siteUrl: (config?.app as { website?: string; url?: string } | undefined)?.website,
      }),
    [config],
  );
  const doc = useMemo(() => buildHtmlDocument(html, theme), [html, theme]);
  const source = useMemo(() => ({ html: doc, baseUrl }), [doc, baseUrl]);

  // Sync during render: theme / baseUrl / html all rebuild `source` and iOS
  // will immediately ask for baseUrl. A useEffect reset would run too late.
  if (htmlViewSourceChanged(sourceRef.current, source)) {
    documentLoaded.current = false;
    cover.setValue(1);
  }
  sourceRef.current = source;

  const onLoadEnd = useCallback(() => {
    documentLoaded.current = true;
    Animated.timing(cover, {
      toValue: 0,
      duration: SCREEN_FADE_DURATION_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [cover]);

  return (
    <View style={[styles.web, { backgroundColor: theme.background }]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={source}
        style={[styles.web, { backgroundColor: theme.background }]}
        containerStyle={{ flex: 1, backgroundColor: theme.background }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        cacheMode={CMS_HTML_CACHE_MODE}
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onLoadEnd={onLoadEnd}
        onNavigationStateChange={androidBack.onNavigationStateChange}
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data);
            if (payload?.type === 'eatapp' && typeof payload.url === 'string') runAppLink(payload.url);
          } catch {
            /* builder pages may postMessage unrelated strings */
          }
        }}
        onShouldStartLoadWithRequest={(req) => {
          const decision = htmlViewNavDecision(req.url, baseUrl, {
            isTopFrame: req.isTopFrame,
            navigationType: req.navigationType,
            documentLoaded: documentLoaded.current,
          });
          if (decision === 'allow') return true;
          if (decision === 'block') return false;
          if (decision === 'app') {
            runAppLink(req.url);
            return false;
          }
          if (decision === 'link') {
            Linking.openURL(req.url).catch(() => {});
            return false;
          }
          router.push({ pathname: '/web', params: { url: req.url } });
          return false;
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.cover, { backgroundColor: theme.background, opacity: cover }]}
      />
    </View>
  );
});

/** Full-screen in-app browser used for every external navigation target. */
export function UrlView({ url, active = true }: { url: string; active?: boolean }) {
  const theme = useTheme();
  const { config } = useConfig();
  const wv = (config?.webview ?? {}) as Record<string, any>;
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const webRef = useRef<WebView>(null);
  const androidBack = useAndroidWebViewBack(webRef, active);

  const uri = /^https?:\/\//i.test(url) ? url : `https://${url}`;

  if (failed) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary, textAlign: 'center', marginBottom: 12 }}>
          This page could not be loaded.
        </Text>
        <Text
          onPress={() => Linking.openURL(uri).catch(() => {})}
          style={{ color: theme.primary, fontWeight: '600' }}
        >
          Open in browser
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.web, { backgroundColor: theme.background }]}>
      <WebView
        ref={webRef}
        source={{ uri }}
        originWhitelist={['*']}
        style={[styles.web, { backgroundColor: theme.background }]}
        containerStyle={{ flex: 1, backgroundColor: theme.background }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        // Intentionally no cacheMode: Android LOAD_CACHE_ELSE_NETWORK would
        // serve stale Order menus, prices and Account logins.
        thirdPartyCookiesEnabled={wv.cookies !== false}
        sharedCookiesEnabled={wv.cookies !== false}
        pullToRefreshEnabled={wv.pullToRefresh !== false}
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        // Skip the native loading chrome — it paints white. The themed spinner
        // below is not animated so overlay /web does not double-fade.
        userAgent={
          // Some sites block the default RN WebView UA — present as mobile Safari/Chrome.
          undefined
        }
        onNavigationStateChange={androidBack.onNavigationStateChange}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
        onHttpError={() => setLoading(false)}
        onShouldStartLoadWithRequest={(req) => {
          if (/^(tel:|mailto:|sms:|intent:)/i.test(req.url)) {
            Linking.openURL(req.url).catch(() => {});
            return false;
          }
          return true;
        }}
      />
      {loading && (
        <View style={[styles.overlay, { backgroundColor: theme.background }]} pointerEvents="none">
          <ActivityIndicator color={theme.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  web: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  cover: {
    ...StyleSheet.absoluteFillObject,
  },
});
