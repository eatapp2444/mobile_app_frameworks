import { Linking } from 'react-native';
import type { NavItem } from './config';
import { resolveNavAction, type NavOpts } from './navCore';

export {
  firstParam,
  isCmsHost,
  isExternalUrl,
  resolveNavAction,
  resolvePathname,
  type NavAction,
  type NavOpts,
} from './navCore';

type Router = {
  push: (v: any) => void;
  replace: (v: any) => void;
};

/**
 * Resolves any CMS nav target (tab, app-bar button, submenu child) to a route.
 * The CMS puts external links in `route` (and sometimes `url`), so anything
 * starting with http(s) must open the in-app WebView instead of /p/[slug].
 *
 * Navigation is SINGLE INSTANCE: tapping the destination you are already on
 * does nothing, and tab-style targets replace the current screen so repeated
 * taps never stack duplicate screens behind the back button.
 */
export function openNavTarget(
  router: Router,
  item: Pick<NavItem, 'label' | 'route' | 'url' | 'action'>,
  opts: NavOpts = {},
) {
  const act = resolveNavAction(item, opts);
  if (act.action === 'link') {
    Linking.openURL(act.url).catch(() => {});
    return;
  }
  if (act.action === 'noop') return;
  const go = (v: any) => (opts.replace ? router.replace(v) : router.push(v));
  go(act.to);
}
