import AsyncStorage from '@react-native-async-storage/async-storage';

export function nagStorageKey(bundleId: string, latestVersion: string): string {
  return `eatapp:update-nag:${bundleId || 'app'}:${latestVersion}`;
}

export function localDay(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Soft nag is hidden for the rest of the local calendar day after dismiss. */
export async function wasSoftNagDismissedToday(
  bundleId: string,
  latestVersion: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(nagStorageKey(bundleId, latestVersion));
    return raw === localDay(now);
  } catch {
    return false;
  }
}

export async function dismissSoftNagToday(
  bundleId: string,
  latestVersion: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    await AsyncStorage.setItem(nagStorageKey(bundleId, latestVersion), localDay(now));
  } catch {
    /* storage unavailable — nag may reappear, never block the app */
  }
}
