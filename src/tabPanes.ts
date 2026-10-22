import type { AppConfig, NavItem } from './config';
import { isCmsHost, isExternalUrl } from './navCore';

export const PAGE_UNAVAILABLE_MESSAGE = 'This page is not available yet.';

/** Hard cap on simultaneously mounted WebViews (eager tabs + visited lazy/web). */
export const MAX_MOUNTED_PANES = 6;

export type TabPane =
  | { key: 'home'; kind: 'home'; eager: boolean }
  | { key: `page:${string}`; kind: 'page'; slug: string; eager: boolean }
  | { key: `web:${string}`; kind: 'web'; url: string; title?: string; eager: boolean };

/** Flatten groups / Order-style submenus so each real destination is a pane. */
export function collectNavDestinations(items?: NavItem[] | null): NavItem[] {
  const out: NavItem[] = [];
  const walk = (list?: NavItem[]) => {
    for (const item of list ?? []) {
      if (!item) continue;
      const children = item.children ?? item.submenu?.items ?? [];
      const isGroup = item.isGroup || item.action === 'group';
      if (isGroup && children.length) {
        walk(children);
        continue;
      }
      out.push(item);
      if (children.length) walk(children);
    }
  };
  walk(items ?? []);
  return out;
}

export function paneFromNavItem(item: Pick<NavItem, 'label' | 'route' | 'url' | 'action'>): TabPane | null {
  const target = String(item.url || item.route || '').trim();
  if (!target) return { key: 'home', kind: 'home', eager: true };
  if (/^(tel:|mailto:|sms:)/i.test(target)) return null;
  if (target === '/notifications') return null;
  if (isExternalUrl(target) && !isCmsHost(target)) {
    return { key: `web:${target}`, kind: 'web', url: target, title: item.label, eager: true };
  }
  if (target === '/') return { key: 'home', kind: 'home', eager: true };
  const slug = target.replace(/^\//, '');
  return { key: `page:${slug}`, kind: 'page', slug, eager: true };
}

/**
 * Home + nav destinations are eager; extra `config.pages` are listed so they
 * can mount lazily, but they are not created until first visit.
 */
export function panesFromConfig(config: AppConfig | null | undefined): TabPane[] {
  const panes: TabPane[] = [{ key: 'home', kind: 'home', eager: true }];
  const seen = new Set<string>(['home']);
  const add = (pane: TabPane | null) => {
    if (!pane || seen.has(pane.key)) return;
    seen.add(pane.key);
    panes.push(pane);
  };

  for (const item of collectNavDestinations(config?.navigation?.items)) {
    add(paneFromNavItem(item));
  }
  for (const page of config?.pages ?? []) {
    const slug = String(page.slug ?? '').replace(/^\//, '');
    if (slug) add({ key: `page:${slug}`, kind: 'page', slug, eager: false });
  }
  return panes;
}

export function activePaneKey(pathname: string, webUrl?: string): string | null {
  const path = String(pathname ?? '');
  if (path === '/' || path === '/index') return 'home';
  if (path.startsWith('/p/')) {
    const slug = path.replace(/^\/p\//, '').replace(/^\//, '');
    return slug ? `page:${slug}` : null;
  }
  if (path.startsWith('/web')) {
    const url = String(webUrl ?? '').trim();
    return url ? `web:${url}` : null;
  }
  return null;
}

function visitedSet(visited: Iterable<string>): Set<string> {
  return visited instanceof Set ? visited : new Set(visited);
}

/**
 * CMS HtmlViews for *nav* destinations pre-mount.
 * Extra config pages and Order/Account WebViews mount on first visit.
 */
export function shouldMountPane(pane: TabPane, activeKey: string, visited: Iterable<string>): boolean {
  if (pane.key === activeKey) return true;
  if (pane.kind === 'web') return visitedSet(visited).has(pane.key);
  if (pane.eager) return true;
  return visitedSet(visited).has(pane.key);
}

/** Lower number is kept first when the mount cap is exceeded. */
export function paneEvictionRank(pane: TabPane | undefined, activeKey: string): number {
  if (!pane) return 99;
  if (pane.key === activeKey) return 0;
  if (pane.kind === 'web') return 1; // Order / Account
  if (pane.eager) return 2;
  return 3;
}

/**
 * Which panes may keep a WebView given the cap.
 * Ranking: active > Order/Account (web) > other panes. Newer visits win ties.
 */
export function selectMountedPaneKeys(
  panes: TabPane[],
  activeKey: string,
  visitedLru: Iterable<string>,
  cap = MAX_MOUNTED_PANES,
): string[] {
  const visited = Array.from(visitedLru);
  const candidates = panes.filter((pane) => shouldMountPane(pane, activeKey, visited));
  candidates.sort((a, b) => {
    const rank = paneEvictionRank(a, activeKey) - paneEvictionRank(b, activeKey);
    if (rank !== 0) return rank;
    return visited.lastIndexOf(b.key) - visited.lastIndexOf(a.key);
  });

  const out: string[] = [];
  for (const pane of candidates) {
    if (pane.key === activeKey || out.length < cap) out.push(pane.key);
  }
  if (activeKey && !out.includes(activeKey)) out.unshift(activeKey);
  return out.slice(0, Math.max(cap, out.includes(activeKey) ? 1 : 0));
}

/** Drop visited Order/Account + lazy pages; keep the active pane and eager CMS tabs. */
export function keysAfterMemoryPressure(
  panes: TabPane[],
  activeKey: string,
  cap = MAX_MOUNTED_PANES,
): string[] {
  return selectMountedPaneKeys(panes, activeKey, [], cap);
}

/** Short background trips (SMS codes) must not unmount Order/Account. */
export const KEEP_ALIVE_BACKGROUND_TRIM_MS = 10 * 60 * 1000;

export function shouldTrimKeepAlive(
  event:
    | { type: 'memoryWarning' }
    | { type: 'background' }
    | { type: 'backgroundElapsed'; elapsedMs: number; thresholdMs?: number }
    | { type: 'active'; backgroundedAt: number | null; now?: number; thresholdMs?: number },
): boolean {
  const threshold =
    'thresholdMs' in event && event.thresholdMs != null
      ? event.thresholdMs
      : KEEP_ALIVE_BACKGROUND_TRIM_MS;
  if (event.type === 'memoryWarning') return true;
  if (event.type === 'background') return false;
  if (event.type === 'backgroundElapsed') return event.elapsedMs >= threshold;
  if (event.backgroundedAt == null) return false;
  return (event.now ?? Date.now()) - event.backgroundedAt >= threshold;
}

/** Notifications (bell), unknown `/p/<slug>`, and ad-hoc in-app browser sit on top of keep-alive tabs. */
export function isOverlayPath(
  pathname: string,
  webUrl: string | undefined,
  paneKeys: Iterable<string>,
): boolean {
  const path = String(pathname ?? '');
  const keys = paneKeys instanceof Set ? paneKeys : new Set(paneKeys);
  if (path.startsWith('/notifications')) return true;
  if (path === '/' || path === '/index') return false;
  if (path.startsWith('/p/')) {
    const key = activePaneKey(path);
    return !key || !keys.has(key);
  }
  if (path.startsWith('/web')) {
    const key = activePaneKey(path, webUrl);
    return !key || !keys.has(key);
  }
  return true;
}
