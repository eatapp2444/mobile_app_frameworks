/** Compares dotted versions: -1 if a<b, 0 equal, 1 if a>b. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  const pb = String(b)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** True when the value looks like a version we can compare (must contain a digit). */
export function isVersionString(value: unknown): value is string {
  return typeof value === 'string' && /\d/.test(value.trim());
}

function pickVersion(value: unknown): string | undefined {
  if (!isVersionString(value)) return undefined;
  return value.trim();
}

function pickText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length ? t : undefined;
}

/**
 * Per-platform update policy served by the public app config.
 *
 * Exact shape (nested under `config.version`):
 *   version.ios | version.android = {
 *     minVersion?:     string  // installed < this → blocking full-screen
 *     latestVersion?:  string  // installed < this → dismissible nag (once/day)
 *     storeUrl?:       string  // App Store / Play Store URL
 *     message?:        string  // optional copy for both states
 *   }
 *
 * Any absent / empty field is a no-op for that behaviour. Unknown extra
 * keys are ignored so older CMS payloads stay valid.
 */
export type PlatformUpdatePolicy = {
  minVersion?: string;
  latestVersion?: string;
  storeUrl?: string;
  message?: string;
};

/** `config.version` — new per-platform fields plus the legacy force-update keys. */
export type VersionConfig = {
  ios?: PlatformUpdatePolicy;
  android?: PlatformUpdatePolicy;
  /** @deprecated Prefer `ios.minVersion` / `android.minVersion`. */
  forceUpdate?: boolean;
  /** @deprecated Prefer per-platform `minVersion`. */
  minimumVersion?: string;
  latestVersion?: string;
  updateMessage?: string;
  iosStoreUrl?: string;
  androidStoreUrl?: string;
  iosAppId?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
};

export type ResolvedUpdatePolicy = {
  minVersion?: string;
  latestVersion?: string;
  storeUrl?: string;
  message?: string;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  iosAppId?: string;
};

export type UpdateDecision =
  | { kind: 'none' }
  | { kind: 'maintenance'; message: string }
  | { kind: 'forced'; minVersion: string; storeUrl: string; message: string }
  | { kind: 'soft'; latestVersion: string; storeUrl: string; message: string };

/**
 * Merge the new per-platform object with the legacy force-update fields.
 * Nested `ios` / `android` values win when present; missing nested fields
 * fall back to the old `forceUpdate` + `minimumVersion` pair so already-
 * published CMS configs keep working.
 */
export function resolvePlatformPolicy(
  version: VersionConfig | Record<string, unknown> | null | undefined,
  platform: string,
): ResolvedUpdatePolicy {
  const v = (version ?? {}) as VersionConfig;
  const nested = platform === 'ios' || platform === 'android' ? v[platform] : undefined;

  const minFromNested = pickVersion(nested?.minVersion);
  const minFromLegacy = v.forceUpdate ? pickVersion(v.minimumVersion) : undefined;

  return {
    minVersion: minFromNested ?? minFromLegacy,
    latestVersion: pickVersion(nested?.latestVersion) ?? pickVersion(v.latestVersion),
    storeUrl:
      pickText(nested?.storeUrl) ??
      pickText(platform === 'android' ? v.androidStoreUrl : v.iosStoreUrl),
    message: pickText(nested?.message) ?? pickText(v.updateMessage),
    maintenanceMode: !!v.maintenanceMode,
    maintenanceMessage: pickText(v.maintenanceMessage),
    iosAppId: pickText(v.iosAppId),
  };
}

export function fallbackStoreUrl(opts: {
  platform: string;
  bundleId: string;
  appName: string;
  iosAppId?: string;
}): string {
  if (opts.platform === 'android') {
    return opts.bundleId
      ? `https://play.google.com/store/apps/details?id=${opts.bundleId}`
      : 'https://play.google.com/store';
  }
  if (opts.iosAppId) return `https://apps.apple.com/app/id${opts.iosAppId}`;
  return `https://apps.apple.com/search?term=${encodeURIComponent(opts.appName || 'app')}`;
}

/**
 * Decide which gate (if any) to show. Fail-open: no policy / no comparable
 * versions / unknown platform → `{ kind: 'none' }`. Forced wins over soft
 * when installed is below both thresholds.
 */
export function decideUpdate(opts: {
  installed: string;
  policy: ResolvedUpdatePolicy;
  appName: string;
  platform: string;
  bundleId: string;
}): UpdateDecision {
  const { installed, policy, appName, platform, bundleId } = opts;

  if (policy.maintenanceMode) {
    return {
      kind: 'maintenance',
      message: policy.maintenanceMessage || 'We are updating the app. Back shortly.',
    };
  }

  const storeUrl =
    policy.storeUrl || fallbackStoreUrl({ platform, bundleId, appName, iosAppId: policy.iosAppId });

  if (policy.minVersion && compareVersions(installed, policy.minVersion) < 0) {
    return {
      kind: 'forced',
      minVersion: policy.minVersion,
      storeUrl,
      message:
        policy.message || `A new version of ${appName} is available. Please update to continue.`,
    };
  }

  if (policy.latestVersion && compareVersions(installed, policy.latestVersion) < 0) {
    return {
      kind: 'soft',
      latestVersion: policy.latestVersion,
      storeUrl,
      message: policy.message || `A new version of ${appName} is available.`,
    };
  }

  return { kind: 'none' };
}
