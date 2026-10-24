import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findNavTab,
  isAppLink,
  isGroupNavItem,
  moreNavItem,
  normalizeTabName,
  parseAppLink,
  sheetFromNavItem,
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
  assert.deepEqual(parseAppLink('eatapp://open/tab/venues'), { type: 'open-tab', name: 'venues' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/Venues'), { type: 'open-tab', name: 'Venues' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/about-us'), { type: 'open-tab', name: 'about-us' });
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

test('submenu children without isGroup still open a sheet (any tab, not only Order)', () => {
  const venuesOnly: NavItem[] = [
    {
      id: 'venues',
      label: 'Venues',
      children: [
        { id: 'h', label: 'Hahndorf', route: '/hahndorf' },
        { id: 'm', label: 'Murray Bridge', route: '/murray-bridge' },
      ],
    },
  ];
  assert.equal(isGroupNavItem(venuesOnly[0]), true);
  const sheet = sheetFromNavItem(findNavTab(venuesOnly, 'venues'));
  assert.equal(sheet?.title, 'Venues');
  assert.equal(sheet?.items.length, 2);
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
