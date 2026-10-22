import { Platform } from 'react-native';

/**
 * Android Play In-App Updates (IMMEDIATE). Returns true only when Play actually
 * started the overlay. Sideloaded APKs, emulators, Expo Go, and iOS all fail
 * closed into `false` so the caller can open the store URL instead.
 *
 * The native module is required lazily so a missing Play Core / Expo Go build
 * cannot crash app startup.
 */
export async function startAndroidImmediateUpdate(curVersion: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('sp-react-native-in-app-updates') as typeof import('sp-react-native-in-app-updates');
    const SpInAppUpdates = mod.default;
    const immediate = mod.IAUUpdateKind?.IMMEDIATE ?? 1;
    const client = new SpInAppUpdates(false);
    const result = await client.checkNeedsUpdate({ curVersion });
    if (!result?.shouldUpdate) return false;
    await client.startUpdate({ updateType: immediate });
    return true;
  } catch {
    return false;
  }
}
