import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { VersionConfig } from './updatePolicy';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;

export const BUNDLE_ID: string = extra.EATAPP_BUNDLE_ID ?? '';
export const API_URL: string =
  extra.EATAPP_API_URL ?? 'https://mobileforge-studio.lovable.app/api/public/apps/config';

const CACHE_KEY = `eatapp:config:${BUNDLE_ID}`;
const ETAG_KEY = `eatapp:etag:${BUNDLE_ID}`;

export type NavItem = {
  id: string;
  label: string;
  icon?: string;
  route?: string | null;
  url?: string | null;
  action?: string;
  /** Builder group tab (Order, Venues, More). Equivalent to `action: 'group'`. */
  isGroup?: boolean;
  /** Submenu rows when this item is a group (`isGroup` / `action: 'group'`). Same as `submenu.items`. */
  children?: NavItem[];
  submenu?: { title?: string; items?: NavItem[] };
};

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  sentAt?: string | null;
  read?: boolean;
  demo?: boolean;
};

export type BlankHome = {
  bg?: string;
  heading?: string;
  subheading?: string;
  overlay?: 'none' | 'light' | 'dark';
  textPos?: number;
  headingColor?: string;
  subColor?: string;
};

export type AppConfig = {
  app: { id?: string; name: string; bundleId: string; logo?: string; icon?: string; domain?: string };
  design?: Record<string, any>;
  theme: Record<string, any>;
  splash?: Record<string, any>;
  navigation?: {
    style?: string;
    maxVisible?: number;
    moreLabel?: string;
    moreIcon?: string;
    items?: NavItem[];
    appBarButtons?: any[];
    notificationBell?: boolean;
  };
  home?: { layout?: string; html?: string; sections?: any[]; blank?: BlankHome };
  /** Present on live CMS payloads; often `[]` with venue rows on the nav group instead. */
  venues?: unknown[];
  pages?: Array<{ slug: string; title: string; type: string; html?: string; url?: string }>;
  notifications?: { enabled?: boolean; source?: string; history?: NotificationItem[] };
  onesignal?: { appId?: string };
  permissions?: Record<string, any>;
  webview?: Record<string, any>;
  /**
   * Store / update policy. Preferred shape:
   *   version.ios | version.android = { minVersion, latestVersion, storeUrl, message }
   * Legacy forceUpdate / minimumVersion keys are still read. Absent fields = no gate.
   */
  version?: VersionConfig;
};

/** Config bundled into the binary at build time by scripts/fetch-config.js. */
export function bundledConfig(): AppConfig | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../assets/config/app.json') as AppConfig;
  } catch {
    return null;
  }
}

export async function cachedConfig(): Promise<AppConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AppConfig) : null;
  } catch {
    return null;
  }
}

/** Live fetch with ETag support; returns null when unchanged or offline. */
export async function fetchConfig(): Promise<AppConfig | null> {
  try {
    const etag = await AsyncStorage.getItem(ETAG_KEY);
    const res = await fetch(`${API_URL}?bundle=${encodeURIComponent(BUNDLE_ID)}`, {
      headers: {
        Accept: 'application/json',
        'X-App-Bundle': BUNDLE_ID,
        'X-App-Platform': Platform.OS,
        ...(etag ? { 'If-None-Match': etag } : {}),
      },
    });
    if (res.status === 304) return null;
    if (!res.ok) return null;
    const payload = await res.json();
    const config: AppConfig = payload?.data?.config ?? payload?.data ?? payload?.config ?? payload;
    if (!config?.app?.bundleId) return null;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(config));
    const newEtag = res.headers.get('etag');
    if (newEtag) await AsyncStorage.setItem(ETAG_KEY, newEtag);
    return config;
  } catch {
    return null;
  }
}
