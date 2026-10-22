import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Linking, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useConfig, useTheme } from './ConfigProvider';
import { resolveHtmlBaseUrl } from './htmlAssets';

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
</head><body>${html}</body></html>`;
}

/**
 * Renders CMS HTML (home sections, page-builder pages) exactly like the
 * dashboard preview: same font stack, same theme tokens.
 *
 * The page background stays visible until `onLoadEnd`, then the WebView fades
 * in. `baseUrl` is a real https origin so WKWebView/Android can cache images.
 */
export const HtmlView = React.memo(function HtmlView({ html }: { html: string }) {
  const theme = useTheme();
  const { config } = useConfig();
  const router = useRouter();
  const cover = useRef(new Animated.Value(1)).current;
  const htmlRef = useRef(html);

  const fallback = (config?.webview as { url?: string } | undefined)?.url ?? null;
  const baseUrl = useMemo(() => resolveHtmlBaseUrl(html, fallback), [html, fallback]);
  const doc = useMemo(() => buildHtmlDocument(html, theme), [html, theme]);
  const source = useMemo(() => ({ html: doc, baseUrl }), [doc, baseUrl]);

  useEffect(() => {
    if (htmlRef.current === html) return;
    htmlRef.current = html;
    cover.setValue(1);
  }, [html, cover]);

  const onLoadEnd = useCallback(() => {
    Animated.timing(cover, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [cover]);

  return (
    <View style={[styles.web, { backgroundColor: theme.background }]}>
      <WebView
        originWhitelist={['*']}
        source={source}
        style={[styles.web, { backgroundColor: theme.background }]}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onLoadEnd={onLoadEnd}
        onShouldStartLoadWithRequest={(req) => {
          if (req.url === 'about:blank' || req.url.startsWith('data:') || req.url.startsWith('file:')) return true;
          // Never let the CMS/API host itself be opened as a page (it requires a login).
          if (/mobileforge-studio\.lovable\.app/i.test(req.url)) return false;
          if (/^(tel:|mailto:|sms:)/i.test(req.url)) {
            Linking.openURL(req.url).catch(() => {});
            return false;
          }
          if (/^https?:\/\//i.test(req.url) && req.isTopFrame !== false) {
            router.push({ pathname: '/web', params: { url: req.url } });
            return false;
          }
          return true;
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
export function UrlView({ url }: { url: string }) {
  const theme = useTheme();
  const { config } = useConfig();
  const wv = (config?.webview ?? {}) as Record<string, any>;
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

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
        source={{ uri }}
        originWhitelist={['*']}
        style={[styles.web, { backgroundColor: theme.background }]}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        thirdPartyCookiesEnabled={wv.cookies !== false}
        sharedCookiesEnabled={wv.cookies !== false}
        pullToRefreshEnabled={wv.pullToRefresh !== false}
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        startInLoadingState
        userAgent={
          // Some sites block the default RN WebView UA — present as mobile Safari/Chrome.
          undefined
        }
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
        <View style={styles.overlay} pointerEvents="none">
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
