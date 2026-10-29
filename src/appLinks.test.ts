import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findNavPage,
  findNavTab,
  findRoleTab,
  hasGroupFlag,
  isAppLink,
  isGroupNavItem,
  isMultiVenueTab,
  isOrderingHref,
  isTabItemActive,
  moreNavItem,
  navLinkCatalog,
  normalizeTabName,
  parseAppLink,
  resolveAppLinkTarget,
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

test('parseAppLink understands open/order, open/venues and open/tab/<name>', () => {
  assert.deepEqual(parseAppLink('eatapp://open/order'), {
    type: 'open-tab',
    name: 'order',
    role: 'order',
  });
  assert.deepEqual(parseAppLink('eatapp://open/order/'), {
    type: 'open-tab',
    name: 'order',
    role: 'order',
  });
  assert.deepEqual(parseAppLink('EATAPP://OPEN/ORDER'), {
    type: 'open-tab',
    name: 'ORDER',
    role: 'order',
  });
  assert.deepEqual(parseAppLink('eatapp:///open/order'), {
    type: 'open-tab',
    name: 'order',
    role: 'order',
  });
  assert.deepEqual(parseAppLink('eatapp:open/order'), {
    type: 'open-tab',
    name: 'order',
    role: 'order',
  });
  assert.deepEqual(parseAppLink('eatapp://open/order?x=1'), {
    type: 'open-tab',
    name: 'order',
    role: 'order',
  });
  assert.deepEqual(parseAppLink('eatapp://open/venues'), {
    type: 'open-tab',
    name: 'venues',
    role: 'venues',
  });
  assert.deepEqual(parseAppLink('eatapp://open/venues?x=1'), {
    type: 'open-tab',
    name: 'venues',
    role: 'venues',
  });
  assert.deepEqual(parseAppLink('eatapp://open/tab/venues'), { type: 'open-tab', name: 'venues' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/Venues'), { type: 'open-tab', name: 'Venues' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/about-us'), { type: 'open-tab', name: 'about-us' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/order?x=1'), { type: 'open-tab', name: 'order' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/venues#sheet'), { type: 'open-tab', name: 'venues' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/Murray%20Bridge'), {
    type: 'open-tab',
    name: 'Murray Bridge',
  });
  assert.deepEqual(parseAppLink('eatapp://open/page/balgowlah'), { type: 'open-page', target: 'balgowlah' });
  assert.deepEqual(parseAppLink('eatapp://open/page/e75f196a-4fff-4017-b25b-e36136851763'), {
    type: 'open-page',
    target: 'e75f196a-4fff-4017-b25b-e36136851763',
  });
  assert.deepEqual(parseAppLink('eatapp://open/page/'), { type: 'ignore' });
});

test('unknown eatapp actions and non-app URLs are ignored', () => {
  assert.deepEqual(parseAppLink('eatapp://launch/nuke'), { type: 'ignore' });
  assert.deepEqual(parseAppLink('eatapp://open'), { type: 'ignore' });
  assert.deepEqual(parseAppLink('eatapp://open/'), { type: 'ignore' });
  assert.deepEqual(parseAppLink('eatapp://open/tab'), { type: 'ignore' });
  assert.deepEqual(parseAppLink('eatapp://open/tab/'), { type: 'ignore' });
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
  assert.equal(findNavPage(fenwickNav, 'hahndorf')?.route, '/hahndorf');

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

test('navLinkCatalog More wins over a page slugged more', () => {
  const items: NavItem[] = [
    ...fenwickNav,
    { id: 'account', label: 'Account', route: '/account' },
  ];
  const pages = [{ slug: 'more', title: 'More page' }];
  assert.equal(resolveAppLinkTarget('eatapp://open/tab/more', items, { pages })?.route, '/more');
  const catalog = navLinkCatalog(items, { maxVisible: 4 });
  assert.equal(resolveAppLinkTarget('eatapp://open/tab/more', catalog, { pages })?.id, '__more');
  assert.equal(isGroupNavItem(resolveAppLinkTarget('eatapp://open/tab/more', catalog, { pages })), true);
  assert.equal(resolveAppLinkTarget('eatapp://open/page/more', catalog, { pages })?.route, '/more');
});

test('normalizeTabName collapses spaces, underscores, and punctuation', () => {
  assert.equal(normalizeTabName('About us'), 'about-us');
  assert.equal(normalizeTabName('Murray_Bridge'), 'murray-bridge');
  assert.equal(normalizeTabName('  Order  '), 'order');
  assert.equal(normalizeTabName('Order Online!'), 'order-online');
  assert.equal(normalizeTabName('Our Venues'), 'our-venues');
});

const orderOnlineNav: NavItem[] = [
  { id: 'home', label: 'Home', route: '/' },
  {
    id: '0e0b38e9-089c-4bcc-ae31-a9141870fece',
    label: 'Order Online',
    route: 'https://jaihoindian.orderexperience.net/69a92b54321f92c29a015333/menu',
  },
  { id: 'about', label: 'About Us', route: '/our-venue' },
  { id: 'account', label: 'Account', route: 'https://orders.eatapp.online/admin/user/login' },
];

const orderOnlineSingleVenueNav: NavItem[] = [
  { id: 'home', label: 'Home', route: '/' },
  {
    id: 'uuid-order',
    label: 'Order Online',
    route: 'https://bakehouse.orderexperience.net/abc/menu',
  },
  { id: 'uuid-venues', label: 'Our Venues', route: '/our-venue' },
  { id: 'account', label: 'Account', route: 'https://orders.eatapp.online/admin/user/login' },
];

const orderOnlineMultiNav: NavItem[] = [
  { id: 'home', label: 'Home', route: '/' },
  {
    id: 'uuid-order',
    label: 'Order Online',
    isGroup: true,
    action: 'group',
    submenu: {
      title: 'Order Online',
      items: [
        { id: 'warragul-order', label: 'Warragul', route: 'https://bks.orderexperience.net/a/menu' },
        { id: 'trafalgar-order', label: 'Trafalgar', route: 'https://orders.eatapp.online/menu/xyz' },
      ],
    },
  },
  {
    id: 'uuid-venues',
    label: 'Venues',
    isGroup: true,
    action: 'group',
    submenu: {
      title: 'Venues',
      items: [
        { id: 'warragul-venue', label: 'Warragul', route: '/warragul-venue' },
        { id: 'trafalgar-venue', label: 'Trafalgar', route: '/trafalgar' },
      ],
    },
  },
];

const singleOrderGroupNav: NavItem[] = [
  { id: 'home', label: 'Home', route: '/' },
  {
    id: 'order-online',
    label: 'Order Online',
    isGroup: true,
    action: 'group',
    submenu: {
      title: 'Order Online',
      items: [{ id: 'only', label: 'Only venue', route: 'https://only.orderexperience.net/menu' }],
    },
  },
  {
    id: 'our-venues',
    label: 'Our Venues',
    isGroup: true,
    action: 'group',
    submenu: {
      title: 'Our Venues',
      items: [{ id: 'only-page', label: 'Only venue', route: '/only-venue' }],
    },
  },
];

test('findNavTab stays exact; open/order matches Order and Order Online', () => {
  assert.equal(findNavTab(orderOnlineNav, 'order'), null);
  assert.equal(findNavTab(orderOnlineNav, 'Order Online')?.label, 'Order Online');
  assert.equal(findRoleTab(orderOnlineNav, 'order')?.label, 'Order Online');
  assert.equal(findRoleTab(fenwickNav, 'order')?.label, 'Order');
  assert.equal(findRoleTab(orderOnlineNav, 'venues'), null);
  assert.equal(findRoleTab(orderOnlineSingleVenueNav, 'venues')?.label, 'Our Venues');
  assert.equal(findRoleTab(fenwickNav, 'venues')?.label, 'Venues');
  assert.equal(findRoleTab(orderOnlineNav, 'order')?.label, 'Order Online');
  assert.equal(findRoleTab([{ id: 'menu', label: 'Menu', route: '/menu' }], 'order'), null);
  assert.equal(findRoleTab([{ id: 'account', label: 'Account', route: '/account' }], 'order'), null);
  assert.equal(findRoleTab([{ id: 'home', label: 'Home', route: '/' }], 'venues'), null);
  assert.equal(findRoleTab([{ id: 'o', label: 'Order Online!', route: '/x' }], 'order')?.label, 'Order Online!');
  assert.equal(findRoleTab([{ id: 'n', label: 'Order now', route: '/x' }], 'order'), null);
  assert.equal(findRoleTab([{ id: 'v', label: 'Venue', route: '/x' }], 'venues'), null);
  assert.equal(findRoleTab([{ id: 'v', label: 'Our Venue', route: '/x' }], 'venues'), null);
});

test('single-venue open/order opens the listing; multi-venue opens the order sheet', () => {
  const single = resolveAppLinkTarget('eatapp://open/order', orderOnlineSingleVenueNav);
  assert.equal(single?.label, 'Order Online');
  assert.equal(isGroupNavItem(single), false);
  assert.equal(single?.route, 'https://bakehouse.orderexperience.net/abc/menu');
  assert.equal(isOrderingHref(single?.route), true);

  const labelled = resolveAppLinkTarget('eatapp://open/order', orderOnlineNav);
  assert.equal(labelled?.label, 'Order Online');
  assert.equal(isOrderingHref(labelled?.route), true);

  const oneChild = resolveAppLinkTarget('eatapp://open/order', singleOrderGroupNav);
  assert.equal(oneChild?.label, 'Only venue');
  assert.equal(oneChild?.route, 'https://only.orderexperience.net/menu');
  assert.equal(isMultiVenueTab(findRoleTab(singleOrderGroupNav, 'order')), false);

  const multi = resolveAppLinkTarget('eatapp://open/order', orderOnlineMultiNav);
  assert.equal(multi?.label, 'Order Online');
  assert.equal(isGroupNavItem(multi), true);
  assert.equal(isMultiVenueTab(multi), true);
  assert.deepEqual(
    sheetFromNavItem(multi)?.items.map((i) => i.label),
    ['Warragul', 'Trafalgar'],
  );

  const fenwick = resolveAppLinkTarget('eatapp://open/order', fenwickNav);
  assert.equal(fenwick?.label, 'Order');
  assert.equal(isGroupNavItem(fenwick), true);
});

test('single-venue open/venues opens the venue page; multi-venue opens the venues sheet', () => {
  const single = resolveAppLinkTarget('eatapp://open/venues', orderOnlineSingleVenueNav);
  assert.equal(single?.label, 'Our Venues');
  assert.equal(single?.route, '/our-venue');
  assert.equal(isOrderingHref(single?.route), false);

  const oneChild = resolveAppLinkTarget('eatapp://open/venues', singleOrderGroupNav);
  assert.equal(oneChild?.route, '/only-venue');
  assert.equal(isOrderingHref(oneChild?.route), false);

  const multi = resolveAppLinkTarget('eatapp://open/venues', orderOnlineMultiNav);
  assert.equal(isGroupNavItem(multi), true);
  assert.deepEqual(
    sheetFromNavItem(multi)?.items.map((i) => i.route),
    ['/warragul-venue', '/trafalgar'],
  );
});

test('Our Venues row must not resolve to an ordering screen', () => {
  const dest = resolveAppLinkTarget('eatapp://open/venues', orderOnlineMultiNav);
  assert.ok(dest);
  assert.equal(isOrderingHref(dest?.route), false);
  for (const row of sheetFromNavItem(dest)?.items ?? [dest!]) {
    assert.equal(isOrderingHref(row.route), false, `${row.label} must not be an ordering URL`);
    assert.match(String(row.route), /^\//);
  }

  const orderDest = resolveAppLinkTarget('eatapp://open/order', orderOnlineMultiNav);
  assert.notEqual(dest?.id, orderDest?.id);
  assert.ok(sheetFromNavItem(orderDest)?.items.some((i) => isOrderingHref(i.route)));
});

test('unknown tab names are unresolved; open/tab stays exact', () => {
  assert.equal(resolveAppLinkTarget('eatapp://open/tab/missing', fenwickNav), null);
  assert.equal(resolveAppLinkTarget('eatapp://open/tab/nope', orderOnlineNav), null);
  assert.equal(resolveAppLinkTarget('eatapp://open/order', [{ id: 'home', label: 'Home', route: '/' }]), null);
  assert.equal(resolveAppLinkTarget('eatapp://open/venues', orderOnlineNav), null);
  assert.equal(resolveAppLinkTarget('eatapp://launch/nuke', fenwickNav), null);

  // Exact tab link does not role-match Order Online.
  assert.equal(resolveAppLinkTarget('eatapp://open/tab/order', orderOnlineNav), null);
  assert.equal(resolveAppLinkTarget('eatapp://open/tab/Order Online', orderOnlineNav)?.label, 'Order Online');
  assert.equal(resolveAppLinkTarget('eatapp://open/tab/venues', fenwickNav)?.label, 'Venues');
  assert.equal(resolveAppLinkTarget('eatapp://open/tab/about-us', fenwickNav)?.id, 'about-us');
});

test('open/page and open/tab fallback resolve nested venue children by slug or page id', () => {
  const pageId = 'e75f196a-4fff-4017-b25b-e36136851763';
  const phulkari: NavItem[] = [
    { id: 'home', label: 'Home', route: '/' },
    { id: 'order', label: 'Order', route: '/order' },
    {
      id: 'venues',
      label: 'Venues',
      isGroup: true,
      action: 'group',
      children: [
        { id: 'n-balgowlah', label: 'Balgowlah', route: '/balgowlah', value: pageId },
        { id: 'n-mosman', label: 'Mosman', route: '/mosman', value: '11111111-2222-3333-4444-555555555555' },
      ],
    },
  ];
  const pages = [{ id: pageId, slug: 'balgowlah', title: 'Balgowlah' }];

  assert.equal(resolveAppLinkTarget('eatapp://open/page/balgowlah', phulkari, { pages })?.route, '/balgowlah');
  assert.equal(resolveAppLinkTarget(`eatapp://open/page/${pageId}`, phulkari, { pages })?.route, '/balgowlah');
  assert.equal(resolveAppLinkTarget('eatapp://open/page/mosman', phulkari)?.route, '/mosman');
  assert.equal(isGroupNavItem(resolveAppLinkTarget('eatapp://open/tab/venues', phulkari)), true);
  assert.equal(resolveAppLinkTarget('eatapp://open/tab/balgowlah', phulkari)?.route, '/balgowlah');
  assert.equal(resolveAppLinkTarget('eatapp://open/page/venues', phulkari), null);
  assert.equal(resolveAppLinkTarget('eatapp://open/page/hahndorf', fenwickNav)?.route, '/hahndorf');
  assert.equal(resolveAppLinkTarget('eatapp://open/tab/hahndorf', fenwickNav)?.route, '/hahndorf');
});

test('venues role never resolves to an ordering URL', () => {
  const orderingTab: NavItem[] = [
    { id: 'home', label: 'Home', route: '/' },
    {
      id: 'venues',
      label: 'Our Venues',
      route: 'https://fenwick.orderexperience.net/h/menu',
    },
    { id: 'about', label: 'About us', route: '/our-venue' },
  ];
  const fromTab = resolveAppLinkTarget('eatapp://open/venues', orderingTab);
  assert.equal(isOrderingHref(fromTab?.route), false);
  assert.notEqual(fromTab?.route, 'https://fenwick.orderexperience.net/h/menu');
  assert.equal(fromTab, null);

  const pageInstead: NavItem[] = [
    { id: 'home', label: 'Home', route: '/' },
    {
      id: 'venues',
      label: 'Venues',
      route: 'https://fenwick.orderexperience.net/h/menu',
      isGroup: true,
      action: 'group',
      submenu: {
        title: 'Venues',
        items: [{ id: 'page', label: 'Hahndorf', route: '/hahndorf' }],
      },
    },
  ];
  const page = resolveAppLinkTarget('eatapp://open/venues', pageInstead);
  assert.equal(page?.route, '/hahndorf');
  assert.equal(isOrderingHref(page?.route), false);
});

test('venues group whose only child is an ordering listing is not a sheet (case A)', () => {
  const items: NavItem[] = [
    { id: 'home', label: 'Home', route: '/' },
    {
      id: 'venues',
      label: 'Venues',
      isGroup: true,
      action: 'group',
      submenu: {
        title: 'Venues',
        items: [{ id: 'only', label: 'Hahndorf', route: 'https://x.orderexperience.net/menu' }],
      },
    },
  ];
  const dest = resolveAppLinkTarget('eatapp://open/venues', items);
  assert.equal(dest, null);
  assert.equal(isOrderingHref(dest?.route), false);
});

test('venues nested group whose leaves are all ordering listings is not returned (case B)', () => {
  const nested: NavItem = {
    id: 'g',
    label: 'G',
    route: '/g',
    isGroup: true,
    action: 'group',
    submenu: {
      title: 'G',
      items: [
        { id: 'a', label: 'A', route: 'https://x.orderexperience.net/a/menu' },
        { id: 'b', label: 'B', route: 'https://x.orderexperience.net/b/menu' },
      ],
    },
  };
  const items: NavItem[] = [
    { id: 'home', label: 'Home', route: '/' },
    {
      id: 'venues',
      label: 'Venues',
      isGroup: true,
      action: 'group',
      submenu: { title: 'Venues', items: [nested] },
    },
  ];
  const dest = resolveAppLinkTarget('eatapp://open/venues', items);
  assert.notEqual(dest?.id, 'g');
  assert.equal(isGroupNavItem(dest) && dest?.id === 'g', false);
  assert.equal(dest, null);
});

test('venues group with a page route and one ordering child opens the page', () => {
  const items: NavItem[] = [
    { id: 'home', label: 'Home', route: '/' },
    {
      id: 'venues',
      label: 'Venues',
      route: '/venues',
      isGroup: true,
      action: 'group',
      submenu: {
        title: 'Venues',
        items: [{ id: 'only', label: 'Hahndorf', route: 'https://x.orderexperience.net/menu' }],
      },
    },
  ];
  const dest = resolveAppLinkTarget('eatapp://open/venues', items);
  assert.equal(dest?.route, '/venues');
  assert.equal(isGroupNavItem(dest), false);
  assert.equal(isOrderingHref(dest?.route), false);
});

test('empty Order group is not multi-venue just because config.venues has 2+ entries', () => {
  const emptyOrder: NavItem = { id: 'order', label: 'Order', isGroup: true, action: 'group' };
  const items: NavItem[] = [{ id: 'home', label: 'Home', route: '/' }, emptyOrder];
  const config = { venues: [{ name: 'Hahndorf' }, { name: 'Murray Bridge' }] };
  assert.equal(isMultiVenueTab(emptyOrder), false);
  const dest = resolveAppLinkTarget('eatapp://open/order', items, config);
  assert.equal(dest?.id, 'order');
  assert.equal(isGroupNavItem(dest), false);
  assert.equal(sheetFromNavItem(dest), null);
});

test('single-venue Order child without an ordering URL stays on the submenu', () => {
  const noUrl: NavItem[] = [
    { id: 'home', label: 'Home', route: '/' },
    {
      id: 'order',
      label: 'Order',
      isGroup: true,
      action: 'group',
      submenu: { title: 'Order', items: [{ id: 'only', label: 'Only venue' }] },
    },
  ];
  const noUrlDest = resolveAppLinkTarget('eatapp://open/order', noUrl);
  assert.equal(noUrlDest?.id, 'order');
  assert.equal(isGroupNavItem(noUrlDest), true);

  const pageChild: NavItem[] = [
    { id: 'home', label: 'Home', route: '/' },
    {
      id: 'order',
      label: 'Order Online',
      isGroup: true,
      action: 'group',
      submenu: { title: 'Order', items: [{ id: 'only', label: 'Only venue', route: '/only-venue' }] },
    },
  ];
  const pageDest = resolveAppLinkTarget('eatapp://open/order', pageChild);
  assert.equal(pageDest?.id, 'order');
  assert.equal(pageDest?.label, 'Order Online');
  assert.equal(isGroupNavItem(pageDest), true);
  assert.equal(isOrderingHref(pageDest?.route), false);
});
