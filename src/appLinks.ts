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
 *   eatapp://open/tab/<name>     → same as tapping that tab (sheet if it has sub-items)
 *   eatapp://open/order          → convenience alias for eatapp://open/tab/order
 *   anything else eatapp://…     → ignore
 */
export function parseAppLink(url: string): AppLinkAction {
  const raw = String(url ?? '').trim();
  const match = /^eatapp:\/*(.*)$/i.exec(raw);
  if (!match) return { type: 'ignore' };

  let rest = match[1];
  try {
    rest = decodeURIComponent(rest);
  } catch {
    /* keep undecoded rest */
  }

  const parts = rest
    .split(/[/?#]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts[0]?.toLowerCase() !== 'open' || parts.length < 2) return { type: 'ignore' };

  if (parts[1].toLowerCase() === 'tab') {
    const name = parts.slice(2).join('/');
    if (!name) return { type: 'ignore' };
    return { type: 'open-tab', name };
  }

  const name = parts.slice(1).join('/');
  return name ? { type: 'open-tab', name } : { type: 'ignore' };
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

/**
 * Any tab with sub-items opens a sheet (Order, Venues, More, …).
 * `isGroup` / `action: 'group'` are the CMS flags; children alone is enough so a
 * builder submenu still works if those flags are omitted.
 */
export function isGroupNavItem(item: NavItem | null | undefined): boolean {
  if (!item) return false;
  return navItemChildren(item).length > 0;
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
