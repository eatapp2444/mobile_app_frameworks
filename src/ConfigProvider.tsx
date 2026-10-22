import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppConfig, bundledConfig, cachedConfig, fetchConfig } from './config';

type Ctx = {
  config: AppConfig | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ConfigContext = createContext<Ctx>({ config: null, loading: true, refresh: async () => {} });

export const useConfig = () => useContext(ConfigContext);

/** Picks a readable foreground colour for a given background. */
function contrastOn(hex?: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? '#0F172A' : '#FFFFFF';
}

export function useTheme() {
  const { config } = useConfig();
  return useMemo(() => {
    const t = (config?.theme ?? {}) as Record<string, any>;
    const primary = t.primary ?? '#111827';
    const appBar = t.appBar ?? t.appBarBackground ?? primary;
    const family = String(t.fontFamily ?? 'System');
    return {
      primary,
      secondary: t.secondary ?? primary,
      background: t.background ?? '#FFFFFF',
      surface: t.surface ?? '#F8FAFC',
      card: t.card ?? '#FFFFFF',
      text: t.text ?? '#0F172A',
      textSecondary: t.textSecondary ?? '#64748B',
      border: t.border ?? '#E2E8F0',
      tabBar: t.tabBar ?? '#FFFFFF',
      tabActive: t.tabActive ?? primary,
      tabInactive: t.tabInactive ?? '#94A3B8',
      appBar,
      appBarText: t.appBarText ?? contrastOn(appBar),
      cardRadius: Number(t.cardRadius ?? 14),
      buttonRadius: Number(t.buttonRadius ?? 12),
      fontStack: t.fontStack as string | undefined,
      /** undefined => platform system font (SF Pro / Roboto). */
      fontFamilyRN: family && family !== 'System' ? family : undefined,
    };
  }, [config]);
}

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const live = await fetchConfig();
    if (live) setConfig(live);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = (await cachedConfig()) ?? bundledConfig();
      if (alive && cached) setConfig(cached);
      if (alive) setLoading(false);
      await refresh();
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  return <ConfigContext.Provider value={{ config, loading, refresh }}>{children}</ConfigContext.Provider>;
}
