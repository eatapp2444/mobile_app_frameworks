import type { NavItem } from './config';

export const isCmsHost = (v?: string | null) => !!v && /mobileforge-studio\.lovable\.app/i.test(v);

export const isExternalUrl = (v?: string | null) => !!v && /^https?:\/\//i.test(v);

export type NavOpts = {
  /** Current pathname — tapping the active destination becomes a no-op. */
  current?: string;
  /** Replace the current screen instead of pushing a new one (tab behaviour). */
  replace?: boolean;
};

/** Resolves a CMS target to the pathname it will land on. */
export function resolvePathname(target: string) {
  if (isExternalUrl(target) && !isCmsHost(target)) return '/web';
  if (!target || target === '/') return '/';
  if (target === '/notifications') return '/notifications';
  return `/p/${target.replace(/^\//, '')}`;
}

export type NavAction =
  | { action: 'link'; url: string }
  | { action: 'noop' }
  | { action: 'route'; to: string | { pathname: string; params?: Record<string, string> } };

/**
 * Pure resolver for CMS nav targets. `openNavTarget` applies this to the router.
 *
 * Navigation is SINGLE INSTANCE: tapping the destination you are already on
 * does nothing, and tab-style callers pass `replace` so repeated taps never
 * stack duplicate screens behind the back button.
 */
export function resolveNavAction(
  item: Pick<NavItem, 'label' | 'route' | 'url' | 'action'>,
  opts: NavOpts = {},
): NavAction {
  const target = String(item.url || item.route || '').trim();

  if (/^(tel:|mailto:|sms:)/i.test(target)) {
    return { action: 'link', url: target };
  }

  const dest = resolvePathname(target);
  const current = String(opts.current ?? '');

  if (isExternalUrl(target) && !isCmsHost(target)) {
    return {
      action: 'route',
      to: { pathname: '/web', params: { url: target, title: item.label ?? '' } },
    };
  }

  // Already here — do nothing instead of pushing another copy.
  if (current && (current === dest || (dest === '/' && current === '/index'))) {
    return { action: 'noop' };
  }

  if (dest === '/' || dest === '/notifications') {
    return { action: 'route', to: dest };
  }
  return { action: 'route', to: { pathname: '/p/[slug]', params: { slug: target.replace(/^\//, '') } } };
}

export function firstParam(v: unknown): string {
  if (Array.isArray(v)) return v[0] == null ? '' : String(v[0]);
  return v == null ? '' : String(v);
}
