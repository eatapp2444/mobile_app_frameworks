import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppConfig, NavItem } from './config';
import { firstParam, resolveNavAction, resolvePathname } from './navCore';
import {
  KEEP_ALIVE_BACKGROUND_TRIM_MS,
  MAX_MOUNTED_PANES,
  PAGE_UNAVAILABLE_MESSAGE,
  activePaneKey,
  collectNavDestinations,
  isOverlayPath,
  keysAfterMemoryPressure,
  paneEvictionRank,
  paneFromNavItem,
  panesFromConfig,
  selectMountedPaneKeys,
  shouldMountPane,
  shouldTrimKeepAlive,
} from './tabPanes';

const domenicoNav: NavItem[] = [
  { id: 'home', label: 'Home', route: '/', action: 'tab' },
  {
    id: 'order',
    label: 'Order',
    route: 'https://domenicospizza.orderexperience.net/652fa4b52a1c90cb5a0ba872/menu',
    action: 'external',
  },
  { id: 'about', label: 'About us', route: '/about-us', action: 'tab' },
  {
    id: 'account',
    label: 'Account',
    route: 'https://orders.eatapp.online/admin/user/login',
    action: 'external',
  },
];

const config = {
  app: { name: "Domenico's Pizza Pasta Ribs", bundleId: 'com.domenicospizzapastaribs.clientapp' },
  theme: {},
  navigation: { maxVisible: 4, moreLabel: 'More', items: domenicoNav },
  pages: [
    { slug: 'about-us', title: 'About Us', type: 'html', html: '<p>About</p>' },
    { slug: 'catering', title: 'Catering', type: 'html', html: '<p>Catering</p>' },
  ],
} as AppConfig;

test('Domenico tabs list nav destinations plus extra config pages (lazy)', () => {
  const panes = panesFromConfig(config);
  assert.deepEqual(
    panes.map((p) => p.key),
    [
      'home',
      'web:https://domenicospizza.orderexperience.net/652fa4b52a1c90cb5a0ba872/menu',
      'page:about-us',
      'web:https://orders.eatapp.online/admin/user/login',
      'page:catering',
    ],
  );
  assert.equal(panes.find((p) => p.key === 'page:catering')?.eager, false);
});

test('Order submenu children are panes; the group itself is not', () => {
  const items: NavItem[] = [
    { id: 'home', label: 'Home', route: '/' },
    {
      id: 'order',
      label: 'Order',
      isGroup: true,
      action: 'group',
      submenu: {
        title: 'Order',
        items: [
          { id: 'pizza', label: 'Pizza', route: '/pizza' },
          { id: 'ribs', label: 'Ribs', route: 'https://order.example/ribs' },
        ],
      },
    },
  ];
  const dest = collectNavDestinations(items);
  assert.deepEqual(
    dest.map((d) => d.label),
    ['Home', 'Pizza', 'Ribs'],
  );
  const panes = panesFromConfig({
    app: { name: 'x', bundleId: 'x' },
    theme: {},
    navigation: { items },
  } as AppConfig);
  assert.ok(!panes.some((p) => p.kind === 'page' && p.slug === 'order'));
  assert.ok(panes.some((p) => p.key === 'page:pizza'));
  assert.ok(panes.some((p) => p.key === 'web:https://order.example/ribs'));
});

test('More overflow items still get panes because they live on navigation.items', () => {
  const items: NavItem[] = [
    { id: '1', label: 'Home', route: '/' },
    { id: '2', label: 'Menu', route: '/menu' },
    { id: '3', label: 'About', route: '/about' },
    { id: '4', label: 'Hours', route: '/hours' },
    { id: '5', label: 'Contact', route: '/contact' },
  ];
  const panes = panesFromConfig({
    app: { name: 'x', bundleId: 'x' },
    theme: {},
    navigation: { maxVisible: 4, moreLabel: 'More', items },
    pages: items.slice(1).map((i) => ({ slug: String(i.route).slice(1), title: i.label, type: 'html' })),
  } as AppConfig);
  assert.ok(panes.some((p) => p.key === 'page:contact'));
});

test('nav CMS pages pre-mount; extra config pages and Order/Account wait until first visit', () => {
  const panes = panesFromConfig(config);
  const home = panes.find((p) => p.key === 'home')!;
  const about = panes.find((p) => p.key === 'page:about-us')!;
  const catering = panes.find((p) => p.key === 'page:catering')!;
  const order = panes.find((p) => p.kind === 'web' && p.url.includes('orderexperience'))!;
  assert.equal(about.eager, true);
  assert.equal(catering.eager, false);
  assert.equal(shouldMountPane(home, 'home', []), true);
  assert.equal(shouldMountPane(about, 'home', []), true);
  assert.equal(shouldMountPane(catering, 'home', []), false);
  assert.equal(shouldMountPane(catering, catering.key, []), true);
  assert.equal(shouldMountPane(order, 'home', []), false);
  assert.equal(shouldMountPane(order, order.key, []), true);
  assert.equal(shouldMountPane(order, 'home', [order.key]), true);
});

test('mounted pane cap keeps the active WebView and drops the oldest extras', () => {
  const extraPages = Array.from({ length: 8 }, (_, i) => ({
    slug: `p${i}`,
    title: `P${i}`,
    type: 'html',
  }));
  const crowded = {
    app: { name: 'x', bundleId: 'x' },
    theme: {},
    navigation: {
      items: extraPages.map((p) => ({ id: p.slug, label: p.title, route: `/${p.slug}` })),
    },
    pages: extraPages,
  } as AppConfig;
  const panes = panesFromConfig(crowded);
  const active = 'page:p7';
  const keys = selectMountedPaneKeys(panes, active, extraPages.map((p) => `page:${p.slug}`), 6);
  assert.ok(keys.includes(active));
  assert.ok(keys.length <= 6);
  assert.equal(MAX_MOUNTED_PANES, 6);
});

test('memory pressure unmounts Order/Account and lazy pages, keeps eager CMS tabs', () => {
  const panes = panesFromConfig(config);
  const order = panes.find((p) => p.kind === 'web' && p.url.includes('orderexperience'))!;
  const after = keysAfterMemoryPressure(panes, 'home');
  assert.ok(after.includes('home'));
  assert.ok(after.includes('page:about-us'));
  assert.ok(!after.includes(order.key));
  assert.ok(!after.includes('page:catering'));
  assert.ok(keysAfterMemoryPressure(panes, order.key).includes(order.key));
});

test('short background trips do not trim Order/Account; memory warning and 10min do', () => {
  assert.equal(shouldTrimKeepAlive({ type: 'background' }), false);
  assert.equal(shouldTrimKeepAlive({ type: 'memoryWarning' }), true);
  assert.equal(KEEP_ALIVE_BACKGROUND_TRIM_MS, 10 * 60 * 1000);
  assert.equal(
    shouldTrimKeepAlive({ type: 'backgroundElapsed', elapsedMs: 30_000 }),
    false,
  );
  assert.equal(
    shouldTrimKeepAlive({ type: 'backgroundElapsed', elapsedMs: KEEP_ALIVE_BACKGROUND_TRIM_MS }),
    true,
  );
  assert.equal(
    shouldTrimKeepAlive({ type: 'active', backgroundedAt: 1_000, now: 1_000 + 60_000 }),
    false,
  );
  assert.equal(
    shouldTrimKeepAlive({
      type: 'active',
      backgroundedAt: 1_000,
      now: 1_000 + KEEP_ALIVE_BACKGROUND_TRIM_MS,
    }),
    true,
  );
});

test('eviction ranking is active > Order/Account > other panes', () => {
  const panes = panesFromConfig(config);
  const order = panes.find((p) => p.kind === 'web' && p.url.includes('orderexperience'))!;
  const account = panes.find((p) => p.kind === 'web' && p.url.includes('eatapp.online'))!;
  assert.equal(paneEvictionRank(panes.find((p) => p.key === 'home'), 'home'), 0);
  assert.equal(paneEvictionRank(order, 'home'), 1);
  assert.equal(paneEvictionRank(panes.find((p) => p.key === 'page:about-us'), 'home'), 2);
  assert.equal(paneEvictionRank(panes.find((p) => p.key === 'page:catering'), 'home'), 3);
  const keys = selectMountedPaneKeys(panes, 'home', [order.key, account.key, 'page:catering'], 3);
  assert.deepEqual(keys, ['home', account.key, order.key]);
  assert.ok(!keys.includes('page:catering'));
  // Over the cap, eager CMS tabs (About) are evicted before Order/Account.
  assert.ok(!keys.includes('page:about-us'));
});

test('unknown /p/<slug> overlays with the unavailable message, not a blank keep-alive', () => {
  const keys = panesFromConfig(config).map((p) => p.key);
  assert.equal(isOverlayPath('/p/about-us', undefined, keys), false);
  assert.equal(isOverlayPath('/p/does-not-exist', undefined, keys), true);
  assert.equal(PAGE_UNAVAILABLE_MESSAGE, 'This page is not available yet.');
});

test('bell / notifications is an overlay, not a keep-alive pane', () => {
  assert.equal(paneFromNavItem({ label: 'Bell', route: '/notifications' }), null);
  assert.equal(isOverlayPath('/notifications', undefined, ['home']), true);
  assert.equal(isOverlayPath('/', undefined, ['home']), false);
});

test('tab web URLs stay in keep-alive; ad-hoc /web links overlay', () => {
  const keys = panesFromConfig(config).map((p) => p.key);
  const order = 'https://domenicospizza.orderexperience.net/652fa4b52a1c90cb5a0ba872/menu';
  assert.equal(isOverlayPath('/web', order, keys), false);
  assert.equal(isOverlayPath('/web', 'https://example.com/specials', keys), true);
});

test('activePaneKey matches replace-style tab routes', () => {
  assert.equal(activePaneKey('/'), 'home');
  assert.equal(activePaneKey('/index'), 'home');
  assert.equal(activePaneKey('/p/about-us'), 'page:about-us');
  assert.equal(
    activePaneKey('/web', 'https://orders.eatapp.online/admin/user/login'),
    'web:https://orders.eatapp.online/admin/user/login',
  );
  assert.equal(activePaneKey('/notifications'), null);
});

test('firstParam unwraps expo-router array search params', () => {
  assert.equal(firstParam('https://example.com'), 'https://example.com');
  assert.equal(firstParam(['https://example.com']), 'https://example.com');
  assert.equal(firstParam(undefined), '');
});

test('tel/mailto targets stay OS links so Order/More sheets can still include them', () => {
  assert.deepEqual(resolveNavAction({ label: 'Call', route: 'tel:0733431144' }), {
    action: 'link',
    url: 'tel:0733431144',
  });
});

test('tab taps resolve to replace-friendly routes and ignore a second tap on the same tab', () => {
  assert.equal(resolvePathname('/'), '/');
  assert.equal(resolvePathname('/about-us'), '/p/about-us');
  assert.equal(
    resolvePathname('https://domenicospizza.orderexperience.net/menu'),
    '/web',
  );
  assert.deepEqual(resolveNavAction({ label: 'Home', route: '/' }, { current: '/' }), {
    action: 'noop',
  });
  assert.deepEqual(resolveNavAction({ label: 'About us', route: '/about-us' }, { current: '/' }), {
    action: 'route',
    to: { pathname: '/p/[slug]', params: { slug: 'about-us' } },
  });
  const order = resolveNavAction(
    { label: 'Order', route: 'https://domenicospizza.orderexperience.net/menu' },
    { current: '/', replace: true },
  );
  assert.equal(order.action, 'route');
  if (order.action === 'route') {
    assert.deepEqual(order.to, {
      pathname: '/web',
      params: { url: 'https://domenicospizza.orderexperience.net/menu', title: 'Order' },
    });
  }
});
