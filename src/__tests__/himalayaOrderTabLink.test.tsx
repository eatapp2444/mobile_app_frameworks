import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockWebViews: Array<{ props: Record<string, any> }> = [];

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = React.forwardRef((props: Record<string, any>, ref: unknown) => {
    mockWebViews.push({ props });
    return React.createElement(View, { ...props, ref, testID: 'mock-webview' });
  });
  WebView.displayName = 'WebView';
  return { __esModule: true, default: WebView, WebView };
});

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/',
  useGlobalSearchParams: () => ({}),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { EATAPP_BUNDLE_ID: 'hr.apps.XXXXXX' } },
}));

const bellaVistaOrder = 'https://himalayarestaurant.orderexperience.net/6701f4f40e98f61f3e0d95be/menu';

jest.mock('../config', () => {
  const actual = jest.requireActual('../config');
  const mockConfig = {
    app: {
      name: 'Himalaya Restaurant',
      bundleId: 'hr.apps.XXXXXX',
      domain: 'himalayarestaurant.com.au',
    },
    theme: {
      primary: '#7C2D12',
      background: '#FAF7F2',
      card: '#FFFFFF',
      text: '#1C1917',
      textSecondary: '#78716C',
      border: '#E7E5E4',
      tabBar: '#FFFFFF',
      tabActive: '#7C2D12',
      tabInactive: '#A8A29E',
    },
    navigation: {
      maxVisible: 4,
      items: [
        { id: 'home', label: 'Home', icon: 'Home', route: '/', action: 'tab' },
        {
          id: '8631c53c-658a-4af0-aa80-5de62011bb02',
          label: 'Order',
          icon: 'Utensils',
          action: 'group',
          route: null,
          isGroup: true,
          children: [
            {
              id: 'bella',
              label: 'Bella Vista',
              action: 'external',
              route: bellaVistaOrder,
            },
            {
              id: 'granville',
              label: 'Granville',
              action: 'external',
              route: 'https://orders.eatapp.online/menu/himalaya-granville',
            },
            {
              id: 'lakemba',
              label: 'Lakemba',
              action: 'external',
              route: 'https://himalayarestaurant.orderexperience.net/6ada6fb70fa9ca91a50683cf/menu',
            },
            {
              id: 'randwick',
              label: 'Randwick',
              action: 'external',
              route: 'https://himalayarandwick.orderexperience.net/5e352bfd505ee93c4b8a2936/menu',
            },
            {
              id: 'rockdale',
              label: 'Rockdale',
              action: 'external',
              route: 'https://himalaya-rockdale.orderexperience.net/5345004831131c1d53bc1d0b/menu',
            },
          ],
          submenu: { style: 'drawer', title: 'Order' },
        },
        {
          id: '1508b70a-f058-4f73-9d88-dd8c77285ed0',
          label: 'Venues',
          icon: 'MapPin',
          action: 'group',
          route: null,
          isGroup: true,
          children: [
            { id: 'v-bv', label: 'Bella Vista', action: 'tab', route: '/himalaya-restaurant-bella-vista' },
            { id: 'v-gv', label: 'Granville', action: 'tab', route: '/himalaya-restaurant-granville' },
          ],
        },
        {
          id: 'account',
          label: 'Account',
          action: 'external',
          route: 'https://orders.eatapp.online/admin/user/login',
        },
      ],
    },
    home: { html: '<a class="btn-primary" href="eatapp://open/tab/order">Order online</a>' },
  };
  return {
    ...actual,
    BUNDLE_ID: 'hr.apps.XXXXXX',
    bundledConfig: () => mockConfig,
    cachedConfig: async () => mockConfig,
    fetchConfig: async () => mockConfig,
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { ConfigProvider } from '../ConfigProvider';
import { HtmlView } from '../HtmlView';
import { TabActionsProvider } from '../TabActions';
import { TabBar } from '../TabBar';

function collectText(node: renderer.ReactTestInstance | string): string {
  if (typeof node === 'string') return node;
  const kids = node.children ?? [];
  return kids.map((c) => collectText(c as renderer.ReactTestInstance | string)).join('');
}

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderHome() {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <ConfigProvider>
          <TabActionsProvider>
            <HtmlView html={'<a class="btn-primary" href="eatapp://open/tab/order">Order online</a>'} />
            <TabBar />
          </TabActionsProvider>
        </ConfigProvider>
      </SafeAreaProvider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree!;
}

function fireHtmlLink(url: string, extra: Record<string, unknown> = {}) {
  const web = mockWebViews[mockWebViews.length - 1];
  expect(web).toBeTruthy();
  return web.props.onShouldStartLoadWithRequest({
    url,
    isTopFrame: true,
    navigationType: 'click',
    ...extra,
  });
}

describe('Himalaya eatapp://open/tab/order', () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    mockWebViews.length = 0;
  });

  it('opens the Order venue drawer, not the first listing', async () => {
    const tree = await renderHome();
    await act(async () => {
      expect(fireHtmlLink('eatapp://open/tab/order')).toBe(false);
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(collectText(tree.root.findByProps({ testID: 'nav-sheet-title' }))).toBe('Order');
    const text = collectText(tree.root);
    expect(text).toContain('Bella Vista');
    expect(text).toContain('Granville');
    expect(text).toContain('Lakemba');
    expect(text).toContain('Randwick');
    expect(text).toContain('Rockdale');
  });

  it('matches the Order tab by UUID as well as by label', async () => {
    const tree = await renderHome();
    await act(async () => {
      expect(fireHtmlLink('eatapp://open/tab/8631c53c-658a-4af0-aa80-5de62011bb02')).toBe(false);
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(collectText(tree.root.findByProps({ testID: 'nav-sheet-title' }))).toBe('Order');
  });

  it('rewritten https://himalayarestaurant.com.au/tab/order opens the sheet, not /web', async () => {
    const tree = await renderHome();
    await act(async () => {
      expect(fireHtmlLink('https://himalayarestaurant.com.au/tab/order')).toBe(false);
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(collectText(tree.root.findByProps({ testID: 'nav-sheet-title' }))).toBe('Order');
    expect(collectText(tree.root)).toContain('Bella Vista');
  });

  it('a real ordering https link still opens /web', async () => {
    await renderHome();
    await act(async () => {
      expect(fireHtmlLink(bellaVistaOrder)).toBe(false);
    });
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/web',
      params: { url: bellaVistaOrder },
    });
  });
});
