import { installedNativeVersion } from '../appVersion';

const mockNative = {
  application: undefined as string | null | undefined,
  constants: undefined as string | null | undefined,
  expo: undefined as string | null | undefined,
};

jest.mock('expo-application', () => ({
  get nativeApplicationVersion() {
    return mockNative.application;
  },
  applicationId: 'com.company.bkstakeaway',
}));

jest.mock('expo-constants', () => ({
  get nativeAppVersion() {
    return mockNative.constants;
  },
  expoConfig: {
    get version() {
      return mockNative.expo;
    },
  },
}));

describe('installedNativeVersion', () => {
  beforeEach(() => {
    mockNative.application = undefined;
    mockNative.constants = undefined;
    mockNative.expo = undefined;
  });

  it('prefers expo-application nativeApplicationVersion', () => {
    mockNative.application = '7.0.2';
    mockNative.constants = '0.0.0';
    mockNative.expo = '1.0.0';
    expect(installedNativeVersion()).toBe('7.0.2');
  });

  it('returns undefined when no native version is available so the gate can skip', () => {
    mockNative.application = null;
    mockNative.constants = null;
    mockNative.expo = undefined;
    expect(installedNativeVersion()).toBeUndefined();
  });

  it('treats empty strings as unknown', () => {
    mockNative.application = '  ';
    mockNative.constants = '';
    mockNative.expo = 'not-a-version';
    expect(installedNativeVersion()).toBeUndefined();
  });
});
