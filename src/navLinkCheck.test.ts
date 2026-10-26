import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppConfig, NavItem } from './config';
import { checkNavLinks } from './navLinkCheck';

const fenwickItems: NavItem[] = [
  { id: 'home', label: 'Home', route: '/' },
  {
    id: 'order',
    label: 'Order',
    isGroup: true,
    action: 'group',
    submenu: {
      title: 'Order',
      items: [
        { id: 'hahndorf', label: 'Hahndorf', route: 'https://order.example.orderexperience.net/h/menu' },
        { id: 'murray', label: 'Murray Bridge', route: 'https://order.example.orderexperience.net/m/menu' },
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
        { id: 'venue-h', label: 'Hahndorf', route: '/hahndorf' },
        { id: 'venue-m', label: 'Murray Bridge', route: '/murray-bridge' },
      ],
    },
  },
];

function cfg(items: NavItem[], html: string): AppConfig {
  return {
    app: { name: 'Test', bundleId: 'app.eatapp.test' },
    theme: {},
    navigation: { items },
    home: { html },
  };
}

test('checkNavLinks passes Fenwick-style eatapp order and venues aliases', () => {
  const report = checkNavLinks(
    cfg(
      fenwickItems,
      '<a href="eatapp://open/order">Order Online</a><a href="eatapp://open/venues">Our Venues</a><li><a href="eatapp://open/venues">Hahndorf</a></li>',
    ),
  );
  assert.equal(report.ok, true, report.checks.filter((c) => !c.ok).map((c) => c.detail).join('\n'));
  assert.ok(report.checks.some((c) => c.href === 'eatapp://open/order' && c.ok && /sheet:Order/.test(c.detail)));
  assert.ok(report.checks.some((c) => c.name === 'Our Venues' && c.ok && /sheet:Venues/.test(c.detail)));
  assert.ok(report.checks.some((c) => c.name.startsWith('nav:') && c.ok));
});

test('Our Venues row must not resolve to an ordering screen', () => {
  const report = checkNavLinks(
    cfg(
      fenwickItems,
      '<a href="eatapp://open/order">Order Online</a><a href="https://order.example.orderexperience.net/h/menu">Hahndorf</a>',
    ),
  );
  assert.equal(report.ok, false);
  const bad = report.checks.find((c) => !c.ok && /Hahndorf/.test(c.name));
  assert.ok(bad, 'expected a failing Hahndorf venue row');
  assert.match(bad!.detail, /must not resolve to an ordering screen/);
});

test('unknown tab in homepage HTML is a dead-link failure', () => {
  const report = checkNavLinks(
    cfg(fenwickItems, '<a href="eatapp://open/tab/not-a-tab">Mystery</a>'),
  );
  assert.equal(report.ok, false);
  assert.ok(report.checks.some((c) => !c.ok && /dead link/.test(c.detail)));
});

test('single-venue Order Online alias opens the listing, not a sheet', () => {
  const items: NavItem[] = [
    { id: 'home', label: 'Home', route: '/' },
    {
      id: 'uuid-order',
      label: 'Order Online',
      route: 'https://bakehouse.orderexperience.net/abc/menu',
    },
    { id: 'uuid-venues', label: 'Our Venues', route: '/our-venue' },
  ];
  const report = checkNavLinks(
    cfg(items, '<a href="eatapp://open/order">Order Online</a><a href="eatapp://open/venues">Our Venues</a>'),
  );
  assert.equal(report.ok, true, report.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join('\n'));
  const order = report.checks.find((c) => c.name === 'Order Online' && c.href === 'eatapp://open/order');
  assert.match(order?.detail ?? '', /order-listing:/);
  const venues = report.checks.find((c) => c.name === 'Our Venues' && c.href === 'eatapp://open/venues');
  assert.match(venues?.detail ?? '', /page:\/our-venue/);
});
