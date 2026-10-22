import { installedNativeVersion } from '../appVersion';

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '7.0.2',
  applicationId: 'com.company.bkstakeaway',
}));

jest.mock('expo-constants', () => ({
  nativeAppVersion: '0.0.0',
  expoConfig: { version: '1.0.0' },
}));

describe('installedNativeVersion', () => {
  it('prefers expo-application nativeApplicationVersion', () => {
    expect(installedNativeVersion()).toBe('7.0.2');
  });
});
