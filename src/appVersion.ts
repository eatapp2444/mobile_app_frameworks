import * as Application from 'expo-application';
import Constants from 'expo-constants';

function asVersion(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return /\d/.test(t) ? t : undefined;
}

/**
 * Marketing version baked into the native binary (CFBundleShortVersionString /
 * versionName). Returns `undefined` when nothing readable is present so the
 * update gate can fail open instead of treating a missing version as `0.0.0`.
 */
export function installedNativeVersion(): string | undefined {
  return (
    asVersion(Application.nativeApplicationVersion) ??
    asVersion(Constants.nativeAppVersion) ??
    asVersion(Constants.expoConfig?.version)
  );
}
