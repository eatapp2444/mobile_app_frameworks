import {
  findRoleTab,
  isGroupNavItem,
  isOrderTab,
  isOrderingHref,
  navItemChildren,
  navItemHref,
  normalizeTabName,
  resolveAppLinkTarget,
} from './appLinks';
import type { AppConfig, NavItem } from './config';

export type NavLinkCheck = {
  name: string;
  href: string;
  ok: boolean;
  detail: string;
};

export type NavLinkReport = {
  ok: boolean;
  checks: NavLinkCheck[];
};

const ORDER_CTA = new Set(['order', 'order-online', 'order-now', 'online-order', 'online-ordering']);
const VENUES_CTA = new Set(['venues', 'venue', 'our-venues', 'our-venue']);

function unwrapConfig(input: unknown): AppConfig {
  const raw = (input ?? {}) as Record<string, unknown>;
  const nested =
    (raw.data as Record<string, unknown> | undefined)?.config ??
    raw.data ??
    raw.config ??
    raw;
  return nested as AppConfig;
}

export function extractAnchors(html: string): Array<{ href: string; text: string }> {
  const out: Array<{ href: string; text: string }> = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(html ?? '')))) {
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    out.push({ href: m[1].trim(), text });
  }
  return out;
}

function labelKind(text: string): 'order' | 'venues' | null {
  const n = normalizeTabName(text);
  if (ORDER_CTA.has(n)) return 'order';
  if (VENUES_CTA.has(n)) return 'venues';
  return null;
}

function describeItem(item: NavItem | null): string {
  if (!item) return 'unresolved (dead link)';
  if (isGroupNavItem(item)) {
    const kids = navItemChildren(item);
    return `sheet:${item.submenu?.title ?? item.label} (${kids.length})`;
  }
  const href = navItemHref(item);
  if (!href || href === '/') return `tab:${item.label} → home`;
  if (isOrderingHref(href)) return `order-listing:${href}`;
  if (/^https?:\/\//i.test(href)) return `web:${href}`;
  return `page:${href}`;
}

function isOrderingItem(item: NavItem | null): boolean {
  if (!item) return false;
  if (isOrderTab(item)) return true;
  if (isGroupNavItem(item) && navItemChildren(item).some((c) => isOrderingHref(navItemHref(c)))) {
    return true;
  }
  return isOrderingHref(navItemHref(item));
}

function checkResolved(
  name: string,
  href: string,
  items: NavItem[],
  config: AppConfig,
  expectVenues = false,
): NavLinkCheck {
  const item = resolveAppLinkTarget(href, items, config);
  if (!item) {
    return { name, href, ok: false, detail: 'unresolved (dead link)' };
  }
  if (expectVenues && isOrderingItem(item)) {
    return {
      name,
      href,
      ok: false,
      detail: `Our Venues row must not resolve to an ordering screen (${describeItem(item)})`,
    };
  }
  return { name, href, ok: true, detail: describeItem(item) };
}

function checkNavItem(item: NavItem, prefix: string): NavLinkCheck[] {
  const name = `${prefix}${item.label || item.id || 'item'}`;
  if (isGroupNavItem(item)) {
    const kids = navItemChildren(item);
    const rows: NavLinkCheck[] = [
      {
        name,
        href: `(group)`,
        ok: kids.length > 0,
        detail: kids.length ? `sheet:${item.submenu?.title ?? item.label} (${kids.length})` : 'empty group',
      },
    ];
    for (const child of kids) {
      rows.push(...checkNavItem(child, `${name} / `));
    }
    return rows;
  }
  const href = navItemHref(item);
  if (!href) {
    return [{ name, href: '', ok: false, detail: 'missing route/url' }];
  }
  if (/^(tel:|mailto:|sms:)/i.test(href)) {
    return [{ name, href, ok: true, detail: `os:${href}` }];
  }
  return [{ name, href, ok: true, detail: describeItem(item) }];
}

/**
 * Pass/fail every homepage Order Online / Our Venues destination and every
 * bottom-nav item. Venue rows that still point at an ordering URL fail.
 */
export function checkNavLinks(input: unknown): NavLinkReport {
  const config = unwrapConfig(input);
  const items = (config.navigation?.items ?? []).filter(Boolean);
  const html = String(config.home?.html ?? '');
  const checks: NavLinkCheck[] = [];
  const seen = new Set<string>();
  const venueRowLabels = new Set(
    navItemChildren(findRoleTab(items, 'venues')).map((c) => normalizeTabName(c.label)),
  );

  const add = (row: NavLinkCheck) => {
    const key = `${row.name}\0${row.href}`;
    if (seen.has(key)) return;
    seen.add(key);
    checks.push(row);
  };

  for (const a of extractAnchors(html)) {
    const kind = labelKind(a.text);
    if (/^eatapp:/i.test(a.href)) {
      const venues =
        kind === 'venues' || /\/(?:open\/)?venues/i.test(a.href) || /\/tab\/venues/i.test(a.href);
      add(checkResolved(a.text || a.href, a.href, items, config, venues));
      continue;
    }
    if (kind === 'order') {
      add({
        name: a.text || 'Order Online',
        href: a.href,
        ok: !!a.href && a.href !== '#',
        detail: isOrderingHref(a.href) ? `order-listing:${a.href}` : `href:${a.href}`,
      });
      continue;
    }
    if (kind === 'venues' || venueRowLabels.has(normalizeTabName(a.text))) {
      if (isOrderingHref(a.href)) {
        add({
          name: a.text || 'Our Venues',
          href: a.href,
          ok: false,
          detail: `Our Venues row must not resolve to an ordering screen (${a.href})`,
        });
        continue;
      }
      add({
        name: a.text || 'Our Venues',
        href: a.href,
        ok: !!a.href && a.href !== '#',
        detail: `href:${a.href}`,
      });
    }
  }

  if (findRoleTab(items, 'order')) {
    add(checkResolved('Order Online', 'eatapp://open/order', items, config, false));
  }
  if (findRoleTab(items, 'venues')) {
    add(checkResolved('Our Venues', 'eatapp://open/venues', items, config, true));
  }

  for (const item of items) {
    for (const row of checkNavItem(item, 'nav:')) add(row);
  }

  return { ok: checks.every((c) => c.ok), checks };
}

export function formatNavLinkReport(report: NavLinkReport): string {
  const lines = report.checks.map((c) => {
    const mark = c.ok ? 'PASS' : 'FAIL';
    return `${mark}  ${c.name}  ${c.href}  →  ${c.detail}`;
  });
  lines.push(report.ok ? 'OK' : 'FAILED');
  return lines.join('\n');
}
