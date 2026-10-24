import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findNavTab,
  hasGroupFlag,
  isAppLink,
  isGroupNavItem,
  isTabItemActive,
  moreNavItem,
  normalizeTabName,
  parseAppLink,
  sheetFromNavItem,
  shouldAcceptAppLink,
} from './appLinks';
import type { NavItem } from './config';

/** Fenwick-style multi-venue Order group (Hahndorf / Murray Bridge / Mount Barker). */
const fenwickNav: NavItem[] = [
  { id: 'home', label: 'Home', route: '/' },
  {
    id: 'order',
    label: 'Order',
    isGroup: true,
    action: 'group',
    submenu: {
      title: 'Order',
      items: [
        { id: 'hahndorf', label: 'Hahndorf', route: 'https://order.example/hahndorf' },
        { id: 'murray-bridge', label: 'Murray Bridge', route: 'https://order.example/murray' },
        { id: 'mount-barker', label: 'Mount Barker', route: 'https://order.example/barker' },
      ],
    },
  },
  {
    id: 'venues',
    label: 'Venues',
    isGroup: true,
    action: 'group',
    submenu: {
      title: 'Venues',
      items: [
        { id: 'venue-hahndorf', label: 'Hahndorf', route: '/hahndorf' },
        { id: 'venue-murray', label: 'Murray Bridge', route: '/murray-bridge' },
        { id: 'venue-barker', label: 'Mount Barker', route: '/mount-barker' },
      ],
    },
  },
  { id: 'about-us', label: 'About us', route: '/about-us' },
];

test('parseAppLink understands open/order and open/tab/<name>', () => {
  assert.deepEqual(parseAppLink('eatapp://open/order'), { type: 'open-tab', name: 'order' });
  assert.deepEqual(parseAppLink('eatapp://open/order/'), { type: 'open-tab', name: 'order' });
  assert.deepEqual(parseAppLink('EATAPP://OPEN/ORDER'), { type: 'open-tab', name: 'ORDER' });
  assert.deepEqual(parseAppLink('eatapp:///open/order'), { type: 'open-tab', name: 'order' });
  assert.deepEqual(parseAppLink('eatapp:open/order'), { type: 'open-tab', name: 'order' });
  assert.deepEqual(parseAppLink('eatapp://open/order?x=1'), { type: 'open-tab', name: 'order' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/venues'), { type: 'open-tab', name: 'venues' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/Venues'), { type: 'open-tab', name: 'Venues' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/about-us'), { type: 'open-tab', name: 'about-us' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/order?x=1'), { type: 'open-tab', name: 'order' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/venues#sheet'), { type: 'open-tab', name: 'venues' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/Murray%20Bridge'), {
    type: 'open-tab',
    name: 'Murray Bridge',
  });
});

test('unknown eatapp actions and non-app URLs are ignored', () => {
  assert.deepEqual(parseAppLink('eatapp://launch/nuke'), { type: 'ignore' });
  assert.deepEqual(parseAppLink('eatapp://open'), { type: 'ignore' });
  assert.deepEqual(parseAppLink('eatapp://open/'), { type: 'ignore' });
  assert.deepEqual(parseAppLink('eatapp://open/tab'), { type: 'ignore' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/'), { type: 'ignore' });
  assert.deepEqual(parseAppLink('eatapp://open/venues'), { type: 'ignore' });
  assert.deepEqual(parseAppLink('eatapp://open/about-us'), { type: 'ignore' });
  assert.deepEqual(parseAppLink('eatapp://'), { type: 'ignore' });
  assert.deepEqual(parseAppLink('https://example.com/order'), { type: 'ignore' });
  assert.deepEqual(parseAppLink('tel:0733431144'), { type: 'ignore' });
  assert.deepEqual(parseAppLink(''), { type: 'ignore' });
  assert.equal(isAppLink('eatapp://open/order'), true);
  assert.equal(isAppLink('https://example.com'), false);
});

test('findNavTab matches id or label; sheetFromNavItem matches a tab tap', () => {
  const order = findNavTab(fenwickNav, 'order');
  assert.equal(order?.label, 'Order');
  assert.equal(findNavTab(fenwickNav, 'Order')?.id, 'order');
  assert.equal(findNavTab(fenwickNav, 'ORDER')?.id, 'order');
  assert.equal(findNavTab(fenwickNav, 'venues')?.label, 'Venues');
  assert.equal(findNavTab(fenwickNav, 'About us')?.id, 'about-us');
  assert.equal(findNavTab(fenwickNav, 'about-us')?.label, 'About us');
  assert.equal(findNavTab(fenwickNav, 'missing'), null);
  assert.equal(findNavTab(fenwickNav, 'Hahndorf'), null); // submenu child is not a tab

  assert.equal(isGroupNavItem(order), true);
  assert.equal(isGroupNavItem(findNavTab(fenwickNav, 'venues')), true);
  assert.equal(isGroupNavItem(findNavTab(fenwickNav, 'about-us')), false);

  const orderFromAlias = sheetFromNavItem(findNavTab(fenwickNav, 'order'));
  const orderFromTabLink = sheetFromNavItem(findNavTab(fenwickNav, 'order'));
  assert.deepEqual(orderFromAlias, orderFromTabLink);
  assert.equal(orderFromAlias?.title, 'Order');
  assert.deepEqual(
    orderFromAlias?.items.map((i) => i.label),
    ['Hahndorf', 'Murray Bridge', 'Mount Barker'],
  );

  const venues = sheetFromNavItem(findNavTab(fenwickNav, parseAppLink('eatapp://open/tab/venues').type === 'open-tab' ? 'venues' : ''));
  assert.equal(venues?.title, 'Venues');
  assert.deepEqual(
    venues?.items.map((i) => i.route),
    ['/hahndorf', '/murray-bridge', '/mount-barker'],
  );
  assert.equal(sheetFromNavItem(findNavTab(fenwickNav, 'about-us')), null);
});

test('children without isGroup/action:group are not a sheet (tab still opens its URL)', () => {
  const menu: NavItem = {
    id: 'menu',
    label: 'Menu',
    url: 'https://example.com/menu',
    children: [{ id: 'sub', label: 'Sub', route: '/sub' }],
  };
  assert.equal(isGroupNavItem(menu), false);
  assert.equal(sheetFromNavItem(menu), null);
});

test('isActive follows any children, flag or not; chevron is flag-only even if empty', () => {
  const sub: NavItem = { id: 'sub', label: 'Sub', route: '/sub' };
  const menu: NavItem = {
    id: 'menu',
    label: 'Menu',
    url: 'https://example.com/menu',
    children: [sub],
  };
  const paged: NavItem = {
    id: 'page',
    label: 'Page',
    route: '/p',
    submenu: { items: [sub] },
  };
  const emptyGroup: NavItem = { id: 'order', label: 'Order', isGroup: true, action: 'group' };
  const onSub = (item: NavItem) => item.route === '/sub';
  const onMenuUrl = (item: NavItem) => item.url === 'https://example.com/menu';
  assert.equal(isTabItemActive(menu, onSub), true);
  assert.equal(isTabItemActive(paged, onSub), true);
  assert.equal(isTabItemActive(menu, onMenuUrl), false);
  assert.equal(hasGroupFlag(emptyGroup), true);
  assert.equal(isGroupNavItem(emptyGroup), false);
  assert.equal(hasGroupFlag(menu), false);
});

test('duplicate eatapp activations within the dedup window are ignored', () => {
  const url = 'eatapp://open/order';
  assert.equal(shouldAcceptAppLink(null, url, 1000), true);
  assert.equal(shouldAcceptAppLink({ url, at: 1000 }, url, 1100), false);
  assert.equal(shouldAcceptAppLink({ url, at: 1000 }, url, 1500), true);
  assert.equal(shouldAcceptAppLink({ url, at: 1000 }, 'eatapp://open/tab/venues', 1100), true);
});

test('More overflow is addressable as eatapp://open/tab/more', () => {
  const overflow = fenwickNav.slice(3);
  const more = moreNavItem(overflow, 'More');
  assert.ok(more);
  const catalog = [...fenwickNav, more!];
  assert.equal(findNavTab(catalog, 'more')?.id, '__more');
  assert.deepEqual(
    sheetFromNavItem(findNavTab(catalog, 'More'))?.items.map((i) => i.label),
    ['About us'],
  );
  assert.equal(moreNavItem([]), null);
});

test('normalizeTabName collapses spaces and underscores', () => {
  assert.equal(normalizeTabName('About us'), 'about-us');
  assert.equal(normalizeTabName('Murray_Bridge'), 'murray-bridge');
  assert.equal(normalizeTabName('  Order  '), 'order');
});
