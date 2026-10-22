import type { AppConfig, NavItem } from './config';
import { isCmsHost, isExternalUrl } from './navCore';

export type TabPane =
  | { key: 'home'; kind: 'home' }
  | { key: `page:${string}`; kind: 'page'; slug: string }
  | { key: `web:${string}`; kind: 'web'; url: string; title?: string };

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
  if (!target) return { key: 'home', kind: 'home' };
  if (/^(tel:|mailto:|sms:)/i.test(target)) return null;
  if (target === '/notifications') return null;
  if (isExternalUrl(target) && !isCmsHost(target)) {
    return { key: `web:${target}`, kind: 'web', url: target, title: item.label };
  }
  if (target === '/') return { key: 'home', kind: 'home' };
  const slug = target.replace(/^\//, '');
  return { key: `page:${slug}`, kind: 'page', slug };
}

/**
 * One keep-alive slot per tab destination (Home, CMS pages, Order/Account
 * WebViews, More overflow children, Order submenu children).
 */
export function panesFromConfig(config: AppConfig | null | undefined): TabPane[] {
  const panes: TabPane[] = [{ key: 'home', kind: 'home' }];
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
    if (slug) add({ key: `page:${slug}`, kind: 'page', slug });
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

/**
 * CMS HtmlViews pre-mount (so About is warming while Home is on screen).
 * External Order/Account WebViews mount on first visit, then stay mounted.
 */
export function shouldMountPane(pane: TabPane, activeKey: string, visitedWeb: Iterable<string>): boolean {
  if (pane.kind !== 'web') return true;
  if (pane.key === activeKey) return true;
  const seen = visitedWeb instanceof Set ? visitedWeb : new Set(visitedWeb);
  return seen.has(pane.key);
}

/** Notifications (bell) and ad-hoc in-app browser screens sit on top of keep-alive tabs. */
export function isOverlayPath(
  pathname: string,
  webUrl: string | undefined,
  paneKeys: Iterable<string>,
): boolean {
  const path = String(pathname ?? '');
  if (path.startsWith('/notifications')) return true;
  if (path === '/' || path === '/index' || path.startsWith('/p/')) return false;
  if (path.startsWith('/web')) {
    const key = activePaneKey(path, webUrl);
    const keys = paneKeys instanceof Set ? paneKeys : new Set(paneKeys);
    return !key || !keys.has(key);
  }
  return true;
}
