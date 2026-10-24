import type { NavItem } from './config';

/** Custom scheme intercepted by HtmlView (homepage / CMS page HTML). */
export const APP_LINK_SCHEME = 'eatapp:';

export type AppLinkAction = { type: 'open-tab'; name: string } | { type: 'ignore' };

export type NavSheet = { title: string; items: NavItem[] };

export function isAppLink(url: string): boolean {
  return /^eatapp:/i.test(String(url ?? '').trim());
}

/**
 * Parse builder homepage links.
 *
 *   eatapp://open/tab/<name>     → same as tapping that tab (sheet if it is a group)
 *   eatapp://open/order          → the only short alias (same as eatapp://open/tab/order)
 *   anything else eatapp://…     → ignore
 *
 * `?query` and `#hash` are stripped so `eatapp://open/tab/order?x=1` still works.
 */
export function parseAppLink(url: string): AppLinkAction {
  const raw = String(url ?? '').trim();
  const match = /^eatapp:\/*(.*)$/i.exec(raw);
  if (!match) return { type: 'ignore' };

  let rest = match[1];
  const cut = rest.search(/[?#]/);
  if (cut >= 0) rest = rest.slice(0, cut);
  try {
    rest = decodeURIComponent(rest);
  } catch {
    /* keep undecoded rest */
  }

  const parts = rest
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts[0]?.toLowerCase() !== 'open' || parts.length < 2) return { type: 'ignore' };

  if (parts[1].toLowerCase() === 'tab') {
    const name = parts.slice(2).join('/');
    if (!name) return { type: 'ignore' };
    return { type: 'open-tab', name };
  }

  // Short alias is Order only. Venues / About / … must use open/tab/<name>.
  if (parts.length === 2 && parts[1].toLowerCase() === 'order') {
    return { type: 'open-tab', name: parts[1] };
  }
  return { type: 'ignore' };
}

/** Ignore a duplicate eatapp:// activation (Android click + shouldStartLoad). */
export const APP_LINK_DEDUP_MS = 400;

export function shouldAcceptAppLink(
  prev: { url: string; at: number } | null,
  url: string,
  now: number,
  windowMs = APP_LINK_DEDUP_MS,
): boolean {
  if (!prev) return true;
  if (prev.url !== url) return true;
  return now - prev.at >= windowMs;
}

/** "About us" / "about_us" / "About-Us" → "about-us" */
export function normalizeTabName(name: string): string {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function navItemChildren(item: NavItem | null | undefined): NavItem[] {
  if (!item) return [];
  return item.children ?? item.submenu?.items ?? [];
}

/** CMS group flag only — empty groups still show the tab-bar chevron. */
export function hasGroupFlag(item: NavItem | null | undefined): boolean {
  return !!item && !!(item.isGroup || item.action === 'group');
}

/**
 * Tab-bar groups (Order, Venues, More). Requires the CMS flag — a tab that
 * merely has `children` (e.g. Menu with a Sub link) is not a group: tapping it
 * still opens its URL, and it keeps its own keep-alive pane.
 */
export function isGroupNavItem(item: NavItem | null | undefined): boolean {
  return hasGroupFlag(item) && navItemChildren(item).length > 0;
}

/**
 * Highlight a tab when it, or any of its children, is the current route.
 * Children count even without isGroup (main-branch behaviour).
 */
export function isTabItemActive(item: NavItem, routeActive: (child: NavItem) => boolean): boolean {
  const children = navItemChildren(item);
  if (children.length) return children.some(routeActive);
  return routeActive(item);
}

/** Same payload TabBar uses when a group tab (Order / Venues / More) is tapped. */
export function sheetFromNavItem(item: NavItem | null | undefined): NavSheet | null {
  if (!item || !isGroupNavItem(item)) return null;
  return { title: item.submenu?.title ?? item.label, items: navItemChildren(item) };
}

/**
 * Match a top-level tab (including the synthetic More item) by id or label.
 * Does not walk submenu children — `eatapp://open/order` means the Order tab,
 * not a venue named Order.
 */
export function findNavTab(items: NavItem[] | null | undefined, name: string): NavItem | null {
  const want = normalizeTabName(name);
  if (!want) return null;
  for (const item of items ?? []) {
    if (!item) continue;
    if (normalizeTabName(item.id) === want || normalizeTabName(item.label) === want) return item;
  }
  return null;
}

export function moreNavItem(
  overflow: NavItem[],
  label = 'More',
  icon = 'MoreHorizontal',
): NavItem | null {
  if (!overflow.length) return null;
  return { id: '__more', label, icon, isGroup: true, children: overflow };
}
