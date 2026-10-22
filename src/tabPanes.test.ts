import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppConfig, NavItem } from './config';
import { firstParam, resolveNavAction, resolvePathname } from './navCore';
import {
  activePaneKey,
  collectNavDestinations,
  isOverlayPath,
  paneFromNavItem,
  panesFromConfig,
  shouldMountPane,
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
  pages: [{ slug: 'about-us', title: 'About Us', type: 'html', html: '<p>About</p>' }],
} as AppConfig;

test('Domenico tabs become four keep-alive panes (home, order web, about, account web)', () => {
  const panes = panesFromConfig(config);
  assert.deepEqual(
    panes.map((p) => p.key),
    [
      'home',
      'web:https://domenicospizza.orderexperience.net/652fa4b52a1c90cb5a0ba872/menu',
      'page:about-us',
      'web:https://orders.eatapp.online/admin/user/login',
    ],
  );
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

test('CMS pages pre-mount; Order/Account web panes wait until first visit', () => {
  const home = { key: 'home' as const, kind: 'home' as const };
  const about = { key: 'page:about-us' as const, kind: 'page' as const, slug: 'about-us' };
  const order = {
    key: 'web:https://order.example/menu' as const,
    kind: 'web' as const,
    url: 'https://order.example/menu',
  };
  assert.equal(shouldMountPane(home, 'home', []), true);
  assert.equal(shouldMountPane(about, 'home', []), true);
  assert.equal(shouldMountPane(order, 'home', []), false);
  assert.equal(shouldMountPane(order, order.key, []), true);
  assert.equal(shouldMountPane(order, 'home', [order.key]), true);
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
