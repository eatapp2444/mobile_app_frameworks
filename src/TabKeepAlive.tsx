import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useConfig, useTheme } from './ConfigProvider';
import { homeHtml } from './home';
import { HtmlView, UrlView } from './HtmlView';
import {
  KEEP_ALIVE_BACKGROUND_TRIM_MS,
  PAGE_UNAVAILABLE_MESSAGE,
  activePaneKey,
  panesFromConfig,
  selectMountedPaneKeys,
  shouldTrimKeepAlive,
  type TabPane,
} from './tabPanes';

/**
 * Keeps tab destination WebViews mounted for the session (with a cap).
 *
 * Expo Router Tabs cannot do this for EatApp: tab targets are CMS-driven, and
 * both `/p/[slug]` and `/web` are a single route whose params change — that
 * still tears down the WebView. Stack `replace` (see TabBar) only updates the
 * URL for the app bar / active tab; this host owns the actual views.
 */
export function TabKeepAlive({
  pathname,
  webUrl,
  interactive = true,
}: {
  pathname: string;
  webUrl?: string;
  interactive?: boolean;
}) {
  const { config } = useConfig();
  const panes = useMemo(() => panesFromConfig(config), [config]);
  const known = useMemo(() => new Set<string>(panes.map((p) => p.key)), [panes]);
  const resolved = activePaneKey(pathname, webUrl);
  const lastKey = useRef<string>('home');
  if (resolved && known.has(resolved)) lastKey.current = resolved;
  const active = resolved && known.has(resolved) ? resolved : lastKey.current;
  const [visited, setVisited] = useState<string[]>(['home']);

  useEffect(() => {
    if (!active) return;
    setVisited((prev) => {
      const next = prev.filter((k) => k !== active);
      next.push(active);
      return next;
    });
  }, [active]);

  useEffect(() => {
    const eagerHtmlKeys = () =>
      new Set<string>(panes.filter((p) => p.eager && p.kind !== 'web').map((p) => p.key));
    const trimInactiveWeb = () => {
      const eagerHtml = eagerHtmlKeys();
      setVisited((prev) => prev.filter((k) => k === lastKey.current || eagerHtml.has(k)));
    };

    let backgroundedAt: number | null = null;
    let trimTimer: ReturnType<typeof setTimeout> | null = null;
    const clearTrimTimer = () => {
      if (!trimTimer) return;
      clearTimeout(trimTimer);
      trimTimer = null;
    };

    const changeSub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt = Date.now();
        clearTrimTimer();
        trimTimer = setTimeout(() => {
          if (shouldTrimKeepAlive({ type: 'backgroundElapsed', elapsedMs: KEEP_ALIVE_BACKGROUND_TRIM_MS })) {
            trimInactiveWeb();
          }
        }, KEEP_ALIVE_BACKGROUND_TRIM_MS);
        return;
      }
      if (state === 'active') {
        const started = backgroundedAt;
        backgroundedAt = null;
        clearTrimTimer();
        if (shouldTrimKeepAlive({ type: 'active', backgroundedAt: started, now: Date.now() })) {
          trimInactiveWeb();
        }
      }
    });
    const memorySub = AppState.addEventListener('memoryWarning', () => {
      if (shouldTrimKeepAlive({ type: 'memoryWarning' })) trimInactiveWeb();
    });
    return () => {
      changeSub.remove();
      memorySub.remove();
      clearTrimTimer();
    };
  }, [panes]);

  const mountedKeys = useMemo(
    () => new Set<string>(selectMountedPaneKeys(panes, active, visited)),
    [panes, active, visited],
  );

  const showUnavailable = !!resolved && resolved.startsWith('page:') && !known.has(resolved);

  return (
    <View style={styles.host} collapsable={false}>
      {panes
        .filter((pane) => mountedKeys.has(pane.key))
        .map((pane) => (
          <View
            key={pane.key}
            collapsable={false}
            pointerEvents={interactive && !showUnavailable && pane.key === active ? 'auto' : 'none'}
            style={[styles.pane, { zIndex: !showUnavailable && pane.key === active ? 1 : 0 }]}
          >
            <PaneBody pane={pane} active={interactive && pane.key === active} />
          </View>
        ))}
      {showUnavailable ? (
        <View style={[styles.pane, { zIndex: 2 }]} pointerEvents="auto">
          <UnavailablePane />
        </View>
      ) : null}
    </View>
  );
}

const PaneBody = React.memo(function PaneBody({ pane, active }: { pane: TabPane; active: boolean }) {
  if (pane.kind === 'home') return <HomePane active={active} />;
  if (pane.kind === 'page') return <PagePane slug={pane.slug} active={active} />;
  return <UrlView url={pane.url} active={active} />;
});

function HomePane({ active }: { active: boolean }) {
  const { config, loading, refresh } = useConfig();
  const theme = useTheme();
  const html = useMemo(() => homeHtml(config), [config]);

  if (loading && !config) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!config) {
    return (
      <ScrollView
        contentContainerStyle={styles.center}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
      >
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
          Could not load the app configuration.{'\n'}Pull down to retry.
        </Text>
      </ScrollView>
    );
  }

  return <HtmlView html={html} active={active} />;
}

function PagePane({ slug, active }: { slug: string; active: boolean }) {
  const { config } = useConfig();
  const theme = useTheme();
  const key = slug.replace(/^\//, '');
  const page = (config?.pages ?? []).find((p) => String(p.slug ?? '').replace(/^\//, '') === key);

  if (!page) {
    return <UnavailablePane />;
  }

  const url = (page as { url?: string }).url;
  const urlTypes = ['iframe', 'pdf', 'youtube', 'video', 'api', 'external'];
  if (url && (urlTypes.includes(String(page.type)) || /^https?:\/\//i.test(url))) {
    return <UrlView url={url} active={active} />;
  }
  return <HtmlView html={page.html ?? ''} active={active} />;
}

export function UnavailablePane() {
  const theme = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: theme.background }]}>
      <Text style={{ color: theme.textSecondary }}>{PAGE_UNAVAILABLE_MESSAGE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  pane: { ...StyleSheet.absoluteFillObject },
  center: { flexGrow: 1, flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
