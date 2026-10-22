import { Platform } from 'react-native';
import { startAndroidImmediateUpdate } from '../inAppUpdates';

jest.mock('sp-react-native-in-app-updates', () => {
  const startUpdate = jest.fn(async () => undefined);
  const checkNeedsUpdate = jest.fn(async () => ({ shouldUpdate: true }));
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ checkNeedsUpdate, startUpdate })),
    IAUUpdateKind: { FLEXIBLE: 0, IMMEDIATE: 1 },
    __mocks: { startUpdate, checkNeedsUpdate },
  };
});

describe('startAndroidImmediateUpdate', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS });
    jest.clearAllMocks();
  });

  it('does not run on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    await expect(startAndroidImmediateUpdate('1.0.0')).resolves.toBe(false);
  });

  it('starts an IMMEDIATE Play update when Play reports one is available', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    const mod = require('sp-react-native-in-app-updates');
    await expect(startAndroidImmediateUpdate('1.0.0')).resolves.toBe(true);
    expect(mod.__mocks.checkNeedsUpdate).toHaveBeenCalledWith({ curVersion: '1.0.0' });
    expect(mod.__mocks.startUpdate).toHaveBeenCalledWith({ updateType: 1 });
  });

  it('falls back (returns false) when Play says no update is available', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    const mod = require('sp-react-native-in-app-updates');
    mod.__mocks.checkNeedsUpdate.mockResolvedValueOnce({ shouldUpdate: false });
    await expect(startAndroidImmediateUpdate('1.0.0')).resolves.toBe(false);
    expect(mod.__mocks.startUpdate).not.toHaveBeenCalled();
  });

  it('falls back (returns false) when the native module throws', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    const mod = require('sp-react-native-in-app-updates');
    mod.__mocks.checkNeedsUpdate.mockRejectedValueOnce(new Error('not installed from Play'));
    await expect(startAndroidImmediateUpdate('1.0.0')).resolves.toBe(false);
  });
});
