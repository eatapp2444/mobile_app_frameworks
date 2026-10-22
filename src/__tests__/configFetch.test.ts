import { fetchConfig } from '../config';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      EATAPP_BUNDLE_ID: 'app.eatapp.demo',
      EATAPP_API_URL: 'https://mobileforge-studio.lovable.app/api/public/apps/config',
    },
  },
}));

describe('fetchConfig fail-open', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('returns null when the request throws (offline / DNS)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as typeof fetch;
    await expect(fetchConfig()).resolves.toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'unavailable' }),
      headers: { get: () => null },
    }) as unknown as typeof fetch;
    await expect(fetchConfig()).resolves.toBeNull();
  });

  it('returns null when the payload has no app.bundleId', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { hello: 'world' } }),
      headers: { get: () => null },
    }) as unknown as typeof fetch;
    await expect(fetchConfig()).resolves.toBeNull();
  });
});
