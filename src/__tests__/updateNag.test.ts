import AsyncStorage from '@react-native-async-storage/async-storage';
import { dismissSoftNagToday, localDay, nagStorageKey, wasSoftNagDismissedToday } from '../updateNag';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('soft nag once-per-day', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('shows the nag when it has never been dismissed', async () => {
    expect(await wasSoftNagDismissedToday('app.eatapp.demo', '3.6.0')).toBe(false);
  });

  it('hides the nag for the rest of the local calendar day after dismiss', async () => {
    const now = new Date('2026-10-22T09:00:00');
    await dismissSoftNagToday('app.eatapp.demo', '3.6.0', now);
    expect(await wasSoftNagDismissedToday('app.eatapp.demo', '3.6.0', now)).toBe(true);
    expect(await wasSoftNagDismissedToday('app.eatapp.demo', '3.6.0', new Date('2026-10-22T23:59:00'))).toBe(
      true,
    );
  });

  it('shows the nag again the next calendar day', async () => {
    await dismissSoftNagToday('app.eatapp.demo', '3.6.0', new Date('2026-10-22T18:00:00'));
    expect(await wasSoftNagDismissedToday('app.eatapp.demo', '3.6.0', new Date('2026-10-23T08:00:00'))).toBe(
      false,
    );
  });

  it('tracks nags per latestVersion so a newer store build can prompt again', async () => {
    await dismissSoftNagToday('app.eatapp.demo', '3.6.0', new Date('2026-10-22T09:00:00'));
    expect(await wasSoftNagDismissedToday('app.eatapp.demo', '3.7.0', new Date('2026-10-22T09:00:00'))).toBe(
      false,
    );
    expect(nagStorageKey('app.eatapp.demo', '3.6.0')).toBe('eatapp:update-nag:app.eatapp.demo:3.6.0');
  });

  it('formats a stable local day key', () => {
    expect(localDay(new Date('2026-10-22T00:30:00'))).toBe('2026-10-22');
  });
});
