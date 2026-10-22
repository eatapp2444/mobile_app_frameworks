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

/**
 * Which panes may keep a WebView given the cap. Active always wins; eager CMS
 * tabs fill next; visited lazy/web panes fill the rest (newest first).
 */
export function selectMountedPaneKeys(
  panes: TabPane[],
  activeKey: string,
  visitedLru: Iterable<string>,
  cap = MAX_MOUNTED_PANES,
): string[] {
  const known = new Set<string>(panes.map((p) => p.key));
  const visited = Array.from(visitedLru);
  const ranked: string[] = [];
  const push = (key: string) => {
    if (!key || ranked.includes(key)) return;
    if (key !== activeKey && !known.has(key)) return;
    ranked.push(key);
  };

  push(activeKey);
  for (const pane of panes) {
    if (pane.eager && pane.kind !== 'web') push(pane.key);
  }
  for (let i = visited.length - 1; i >= 0; i--) push(visited[i]);

  const out: string[] = [];
  for (const key of ranked) {
    if (key === activeKey || out.length < cap) out.push(key);
  }
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
