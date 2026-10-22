import React from 'react';
import { Platform, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const installed = { value: '3.0.0' };

jest.mock('expo-application', () => ({
  get nativeApplicationVersion() {
    return installed.value;
  },
  applicationId: 'app.eatapp.demo',
}));

jest.mock('../inAppUpdates', () => ({
  startAndroidImmediateUpdate: jest.fn(async () => false),
}));

jest.mock('../config', () => {
  const actual = jest.requireActual('../config');
  const mockConfig = {
    app: { name: 'EatApp', bundleId: 'app.eatapp.demo' },
    theme: { primary: '#111827', background: '#FFFFFF', text: '#0F172A', textSecondary: '#64748B' },
    version: {
      ios: {
        minVersion: '3.5.0',
        latestVersion: '3.6.0',
        storeUrl: 'https://apps.apple.com/app/id123',
        message: 'Please update EatApp to continue.',
      },
      android: {
        minVersion: '3.5.0',
        latestVersion: '3.6.0',
        storeUrl: 'https://play.google.com/store/apps/details?id=app.eatapp.demo',
        message: 'Please update EatApp to continue.',
      },
    },
  };
  return {
    ...actual,
    BUNDLE_ID: 'app.eatapp.demo',
    bundledConfig: () => mockConfig,
    cachedConfig: async () => mockConfig,
    fetchConfig: async () => mockConfig,
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { ConfigProvider } from '../ConfigProvider';
import { UpdateGate } from '../UpdateGate';

function collectText(node: renderer.ReactTestInstance | string): string {
  if (typeof node === 'string') return node;
  const kids = node.children ?? [];
  return kids.map((c) => collectText(c as renderer.ReactTestInstance | string)).join('');
}

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderGate() {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <ConfigProvider>
          <UpdateGate>
            <Text>APP_SHELL</Text>
          </UpdateGate>
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

describe('UpdateGate UI', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS });
    installed.value = '3.0.0';
  });

  it('shows a blocking Update screen when installed is below minVersion', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    installed.value = '3.0.0';
    const tree = await renderGate();
    const text = collectText(tree.root);
    expect(text).toContain('Update required');
    expect(text).toContain('Please update EatApp to continue.');
    expect(text).toContain('Update');
    expect(text).toContain('Installed 3.0.0');
    expect(text).toContain('Required 3.5.0');
    expect(text).not.toContain('APP_SHELL');
  });

  it('shows a dismissible nag when installed is below latestVersion only', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    installed.value = '3.5.0';
    const tree = await renderGate();
    const text = collectText(tree.root);
    expect(text).toContain('APP_SHELL');
    expect(text).toContain('Update available');
    expect(text).toContain('Not now');
  });
});
