import * as Application from 'expo-application';
import Constants from 'expo-constants';

/** Marketing version baked into the native binary (CFBundleShortVersionString / versionName). */
export function installedNativeVersion(): string {
  const v =
    Application.nativeApplicationVersion ??
    Constants.nativeAppVersion ??
    Constants.expoConfig?.version;
  return String(v || '0.0.0');
}
