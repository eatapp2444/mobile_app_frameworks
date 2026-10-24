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
  expoConfig: { extra: { EATAPP_BUNDLE_ID: 'app.eatapp.fenwick' } },
}));

jest.mock('../config', () => {
  const actual = jest.requireActual('../config');
  const mockConfig = {
    app: { name: 'Fenwick', bundleId: 'app.eatapp.fenwick' },
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
      moreLabel: 'More',
      items: [
        { id: 'home', label: 'Home', icon: 'Home', route: '/' },
        {
          id: 'order',
          label: 'Order',
          icon: 'Utensils',
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
          icon: 'MapPin',
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
        { id: 'about-us', label: 'About us', icon: 'Info', route: '/about-us' },
      ],
    },
    home: { html: '<a href="eatapp://open/order">Order now</a>' },
    pages: [
      { slug: 'hahndorf', title: 'Hahndorf', type: 'html', html: '<p>Hahndorf</p>' },
      { slug: 'murray-bridge', title: 'Murray Bridge', type: 'html', html: '<p>Murray Bridge</p>' },
      { slug: 'mount-barker', title: 'Mount Barker', type: 'html', html: '<p>Mount Barker</p>' },
      { slug: 'about-us', title: 'About us', type: 'html', html: '<p>About</p>' },
    ],
  };
  return {
    ...actual,
    BUNDLE_ID: 'app.eatapp.fenwick',
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
            <HtmlView html={'<a href="eatapp://open/order">Order now</a>'} />
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

function fireHtmlLink(url: string) {
  const web = mockWebViews[mockWebViews.length - 1];
  expect(web).toBeTruthy();
  return web.props.onShouldStartLoadWithRequest({
    url,
    isTopFrame: true,
    navigationType: 'click',
  });
}

describe('homepage eatapp://open/order', () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    mockWebViews.length = 0;
  });

  it('opens the same Order venue sheet as tapping the Order tab', async () => {
    const tree = await renderHome();
    expect(collectText(tree.root)).toContain('Order');
    expect(collectText(tree.root)).not.toContain('Hahndorf');

    let allowed: boolean | undefined;
    await act(async () => {
      allowed = fireHtmlLink('eatapp://open/order');
    });
    expect(allowed).toBe(false);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    const text = collectText(tree.root);
    expect(text).toContain('Hahndorf');
    expect(text).toContain('Murray Bridge');
    expect(text).toContain('Mount Barker');
    expect(collectText(tree.root.findByProps({ testID: 'nav-sheet-title' }))).toBe('Order');
  });

  it('ignores unknown eatapp actions and leaves https handling to /web', async () => {
    const tree = await renderHome();

    let unknown: boolean | undefined;
    await act(async () => {
      unknown = fireHtmlLink('eatapp://launch/nuke');
    });
    expect(unknown).toBe(false);
    expect(collectText(tree.root)).not.toContain('Hahndorf');
    expect(mockRouter.push).not.toHaveBeenCalled();

    let https: boolean | undefined;
    await act(async () => {
      https = fireHtmlLink('https://example.com/specials');
    });
    expect(https).toBe(false);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/web',
      params: { url: 'https://example.com/specials' },
    });
  });

  it('postMessage eatapp payload also opens the Order sheet', async () => {
    const tree = await renderHome();
    const web = mockWebViews[mockWebViews.length - 1];
    await act(async () => {
      web.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'eatapp', url: 'eatapp://open/order' }) },
      });
    });
    expect(collectText(tree.root)).toContain('Hahndorf');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('eatapp://open/tab/venues opens the Venues submenu sheet when that tab has sub-items', async () => {
    const tree = await renderHome();
    await act(async () => {
      expect(fireHtmlLink('eatapp://open/tab/venues')).toBe(false);
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    const text = collectText(tree.root);
    expect(text).toContain('Hahndorf');
    expect(text).toContain('Murray Bridge');
    expect(text).toContain('Mount Barker');
    expect(collectText(tree.root.findByProps({ testID: 'nav-sheet-title' }))).toBe('Venues');
  });

  it('eatapp://open/tab/about-us switches a tab that has no submenu', async () => {
    const tree = await renderHome();
    await act(async () => {
      expect(fireHtmlLink('eatapp://open/tab/about-us')).toBe(false);
    });
    expect(collectText(tree.root)).not.toContain('Hahndorf');
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/p/[slug]',
      params: { slug: 'about-us' },
    });
  });
});
