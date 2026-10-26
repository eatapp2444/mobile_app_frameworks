import type { AppConfig, NavItem } from './config';

/** Custom scheme intercepted by HtmlView (homepage / CMS page HTML). */
export const APP_LINK_SCHEME = 'eatapp:';

/** Short homepage aliases that apply the single- vs multi-venue rule. */
export type AppLinkRole = 'order' | 'venues';

export type AppLinkAction =
  | { type: 'open-tab'; name: string; role?: AppLinkRole }
  | { type: 'ignore' };

export type NavSheet = { title: string; items: NavItem[] };

export function isAppLink(url: string): boolean {
  return /^eatapp:/i.test(String(url ?? '').trim());
}

/**
 * Parse builder homepage links.
 *
 *   eatapp://open/tab/<name>     → same as tapping that tab (sheet if it is a group)
 *   eatapp://open/order          → Order / Order Online tab (single- vs multi-venue)
 *   eatapp://open/venues         → Venues / Our Venues tab (single- vs multi-venue)
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

  // Short aliases apply the Fenwick single- vs multi-venue rule.
  if (parts.length === 2) {
    const alias = parts[1].toLowerCase();
    if (alias === 'order' || alias === 'venues') {
      return { type: 'open-tab', name: parts[1], role: alias };
    }
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

/** "About us" / "about_us" / "Order Online!" → "about-us" / "about-us" / "order-online" */
export function normalizeTabName(name: string): string {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

const ORDER_ROLE_NAMES = new Set(['order', 'order-online']);
const VENUES_ROLE_NAMES = new Set(['venues', 'our-venues']);

function tabNames(item: NavItem): string[] {
  return [item.id, item.label].map(normalizeTabName).filter(Boolean);
}

/** True when id/label is Order or Order Online — not Menu, Account, Venues. */
export function isOrderTab(item: NavItem | null | undefined): boolean {
  return !!item && tabNames(item).some((n) => ORDER_ROLE_NAMES.has(n));
}

/** True when id/label is Venues or Our Venues — not Order Online. */
export function isVenuesTab(item: NavItem | null | undefined): boolean {
  return !!item && tabNames(item).some((n) => VENUES_ROLE_NAMES.has(n));
}

export function findRoleTab(
  items: NavItem[] | null | undefined,
  role: AppLinkRole,
): NavItem | null {
  const match = role === 'order' ? isOrderTab : isVenuesTab;
  for (const item of items ?? []) {
    if (match(item)) return item;
  }
  return null;
}

/**
 * Multi-venue only when this Order/Venues group has two or more children to
 * pick from. `config.venues` is not a picker — an empty group with a long
 * venues list still has nothing to show.
 */
export function isMultiVenueTab(item: NavItem | null | undefined): boolean {
  return navItemChildren(item).length >= 2;
}

/**
 * Online ordering listing. CMS venue pages are `/slug`; Account login is not a menu.
 */
export function isOrderingHref(href?: string | null): boolean {
  const raw = String(href ?? '').trim();
  if (!/^https?:\/\//i.test(raw)) return false;
  try {
    const u = new URL(raw);
    if (/orderexperience\.net$/i.test(u.hostname)) return true;
    if (/orders\.eatapp\.online$/i.test(u.hostname) && /\/menu/i.test(u.pathname)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function navItemHref(item: NavItem | null | undefined): string {
  return String(item?.url || item?.route || '').trim();
}

function isVenuePageItem(item: NavItem | null | undefined): boolean {
  const href = navItemHref(item);
  if (!href || href === '/') return false;
  if (isOrderingHref(href)) return false;
  if (/^(tel:|mailto:|sms:)/i.test(href)) return false;
  return !/^https?:\/\//i.test(href);
}

/** Drop group flags so go() opens the page instead of a sheet. */
function asDirectTarget(item: NavItem): NavItem {
  return { id: item.id, label: item.label, route: item.route, url: item.url };
}

function collectLeaves(item: NavItem): NavItem[] {
  const kids = navItemChildren(item);
  if (!kids.length) return [item];
  return kids.flatMap(collectLeaves);
}

/** True when every leaf a group sheet would show is an ordering listing. */
function showsOnlyOrdering(item: NavItem | null | undefined): boolean {
  if (!item) return false;
  const leaves = collectLeaves(item);
  return leaves.length > 0 && leaves.every((leaf) => isOrderingHref(navItemHref(leaf)));
}

function venuePageFallback(tab: NavItem): NavItem | null {
  const pageChild = navItemChildren(tab).find((c) => isVenuePageItem(c) && !showsOnlyOrdering(c));
  if (pageChild) return pageChild;
  if (isVenuePageItem(tab)) return isGroupNavItem(tab) ? asDirectTarget(tab) : tab;
  return null;
}

function resolveOrderTarget(tab: NavItem): NavItem {
  const kids = navItemChildren(tab);
  if (kids.length >= 2) return tab;
  if (kids.length === 1 && isOrderingHref(navItemHref(kids[0]))) return kids[0];
  return tab;
}

function resolveVenuesTarget(tab: NavItem): NavItem | null {
  const kids = navItemChildren(tab);
  let dest: NavItem | null;
  if (kids.length >= 2) dest = tab;
  else if (kids.length === 1) {
    const child = kids[0];
    if (!isOrderingHref(navItemHref(child)) && navItemHref(child)) dest = child;
    else dest = venuePageFallback(tab);
  } else if (isOrderingHref(navItemHref(tab))) {
    dest = venuePageFallback(tab);
  } else {
    dest = tab;
  }

  if (dest && showsOnlyOrdering(dest)) {
    const page = venuePageFallback(tab);
    if (page && !showsOnlyOrdering(page)) return page;
    return null;
  }
  return dest;
}

/**
 * Item TabBar.go() should receive for an eatapp:// homepage link.
 *
 * Short aliases (`open/order`, `open/venues`) match Order / Order Online and
 * Venues / Our Venues, then apply the Fenwick rule: a group with two or more
 * children opens the bottom-nav sheet; otherwise the only listing/page opens
 * directly. The venues role never returns an ordering URL.
 * `open/tab/<name>` stays an exact id/label match and is unchanged.
 */
export function resolveAppLinkTarget(
  url: string,
  items: NavItem[] | null | undefined,
  _config?: Pick<AppConfig, 'venues'> | { venues?: unknown } | null,
): NavItem | null {
  const action = parseAppLink(url);
  if (action.type !== 'open-tab') return null;
  if (action.role) {
    const tab = findRoleTab(items, action.role);
    if (!tab) return null;
    if (action.role === 'order') return resolveOrderTarget(tab);
    const dest = resolveVenuesTarget(tab);
    if (dest && showsOnlyOrdering(dest)) return null;
    if (dest && !isGroupNavItem(dest) && isOrderingHref(navItemHref(dest))) return null;
    return dest;
  }
  return findNavTab(items, action.name);
}

export function moreNavItem(
  overflow: NavItem[],
  label = 'More',
  icon = 'MoreHorizontal',
): NavItem | null {
  if (!overflow.length) return null;
  return { id: '__more', label, icon, isGroup: true, children: overflow };
}
