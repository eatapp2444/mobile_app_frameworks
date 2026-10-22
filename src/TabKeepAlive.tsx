import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useConfig, useTheme } from './ConfigProvider';
import { homeHtml } from './home';
import { HtmlView, UrlView } from './HtmlView';
import { activePaneKey, panesFromConfig, shouldMountPane, type TabPane } from './tabPanes';

/**
 * Keeps every tab destination's WebView mounted for the life of the session.
 *
 * Expo Router Tabs cannot do this for EatApp: tab targets are CMS-driven, and
 * both `/p/[slug]` and `/web` are a single route whose params change — that
 * still tears down the WebView. Stack `replace` (see TabBar) only updates the
 * URL for the app bar / active tab; this host owns the actual views.
 */
export function TabKeepAlive({ pathname, webUrl }: { pathname: string; webUrl?: string }) {
  const { config } = useConfig();
  const panes = useMemo(() => panesFromConfig(config), [config]);
  const resolved = activePaneKey(pathname, webUrl);
  const lastKey = useRef<string>('home');
  if (resolved) lastKey.current = resolved;
  const active = resolved ?? lastKey.current;
  const [visitedWeb, setVisitedWeb] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!active.startsWith('web:')) return;
    setVisitedWeb((prev) => {
      if (prev.has(active)) return prev;
      const next = new Set(prev);
      next.add(active);
      return next;
    });
  }, [active]);

  return (
    <View style={styles.host} collapsable={false}>
      {panes.filter((pane) => shouldMountPane(pane, active, visitedWeb)).map((pane) => (
        <View
          key={pane.key}
          collapsable={false}
          pointerEvents={pane.key === active ? 'auto' : 'none'}
          style={[styles.pane, { zIndex: pane.key === active ? 1 : 0 }]}
        >
          <PaneBody pane={pane} />
        </View>
      ))}
    </View>
  );
}

const PaneBody = React.memo(function PaneBody({ pane }: { pane: TabPane }) {
  if (pane.kind === 'home') return <HomePane />;
  if (pane.kind === 'page') return <PagePane slug={pane.slug} />;
  return <UrlView url={pane.url} />;
});

function HomePane() {
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

  return <HtmlView html={html} />;
}

function PagePane({ slug }: { slug: string }) {
  const { config } = useConfig();
  const theme = useTheme();
  const key = slug.replace(/^\//, '');
  const page = (config?.pages ?? []).find((p) => String(p.slug ?? '').replace(/^\//, '') === key);

  if (!page) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>This page is not available yet.</Text>
      </View>
    );
  }

  const url = (page as { url?: string }).url;
  const urlTypes = ['iframe', 'pdf', 'youtube', 'video', 'api', 'external'];
  if (url && (urlTypes.includes(String(page.type)) || /^https?:\/\//i.test(url))) {
    return <UrlView url={url} />;
  }
  return <HtmlView html={page.html ?? ''} />;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  pane: { ...StyleSheet.absoluteFillObject },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
