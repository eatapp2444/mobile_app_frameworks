import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { installedNativeVersion } from './appVersion';
import { BUNDLE_ID } from './config';
import { useConfig, useTheme } from './ConfigProvider';
import { startAndroidImmediateUpdate } from './inAppUpdates';
import { dismissSoftNagToday, wasSoftNagDismissedToday } from './updateNag';
import {
  compareVersions,
  decideUpdate,
  resolvePlatformPolicy,
  type UpdateDecision,
  type VersionConfig,
} from './updatePolicy';

export { compareVersions };

async function openStore(url: string, platform: string, bundleId: string, appName: string) {
  const candidates = [url];
  if (platform === 'android') {
    if (bundleId) candidates.push(`market://details?id=${bundleId}`);
    if (bundleId) candidates.push(`https://play.google.com/store/apps/details?id=${bundleId}`);
  } else {
    candidates.push(`https://apps.apple.com/search?term=${encodeURIComponent(appName)}`);
  }
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      await Linking.openURL(candidate);
      return;
    } catch {
      /* try the next candidate */
    }
  }
}

function ForcedScreen({
  title,
  message,
  actionLabel,
  onAction,
  footnote,
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  footnote?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <Text
        style={{
          fontSize: 24,
          fontWeight: '700',
          color: theme.text,
          textAlign: 'center',
          fontFamily: theme.fontFamilyRN,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 16,
          color: theme.textSecondary,
          textAlign: 'center',
          marginTop: 12,
          lineHeight: 22,
        }}
      >
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onAction}
        style={{
          marginTop: 28,
          backgroundColor: theme.primary,
          paddingVertical: 14,
          paddingHorizontal: 36,
          borderRadius: theme.buttonRadius,
        }}
      >
        <Text style={{ color: theme.appBarText, fontSize: 16, fontWeight: '600' }}>{actionLabel}</Text>
      </Pressable>
      {footnote ? (
        <Text style={{ marginTop: 16, fontSize: 12, color: theme.textSecondary }}>{footnote}</Text>
      ) : null}
    </View>
  );
}

function SoftNag({
  message,
  onUpdate,
  onDismiss,
}: {
  message: string;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 16 + insets.bottom }}
    >
      <View
        style={{
          backgroundColor: theme.card,
          borderRadius: theme.cardRadius,
          borderWidth: 1,
          borderColor: theme.border,
          padding: 16,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: theme.text,
            fontFamily: theme.fontFamilyRN,
          }}
        >
          Update available
        </Text>
        <Text style={{ fontSize: 14, color: theme.textSecondary, marginTop: 6, lineHeight: 20 }}>{message}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14, gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={onDismiss} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
            <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>Not now</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onUpdate}
            style={{
              backgroundColor: theme.primary,
              paddingVertical: 10,
              paddingHorizontal: 18,
              borderRadius: theme.buttonRadius,
            }}
          >
            <Text style={{ color: theme.appBarText, fontWeight: '600' }}>Update</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function useUpdateDecision(): {
  decision: UpdateDecision;
  installed: string | undefined;
  appName: string;
} {
  const { config } = useConfig();
  const installed = installedNativeVersion();
  const appName = config?.app?.name ?? 'the app';
  const policy = resolvePlatformPolicy((config?.version ?? {}) as VersionConfig, Platform.OS);
  const decision = config
    ? decideUpdate({
        installed,
        policy,
        appName,
        platform: Platform.OS,
        bundleId: BUNDLE_ID || config.app?.bundleId || '',
      })
    : { kind: 'none' as const };
  return { decision, installed, appName };
}

/**
 * Launch + foreground update gate.
 *
 * - `version.{ios,android}.minVersion`: blocking full-screen, Update opens the store
 *   (Android also tries Play In-App Updates IMMEDIATE first).
 * - `version.{ios,android}.latestVersion`: dismissible nag, at most once per local day.
 * - Missing fields, a missing config, or a failed fetch: no gate.
 */
export function UpdateGate({ children }: { children: React.ReactNode }) {
  const { config, refresh } = useConfig();
  const { decision, installed, appName } = useUpdateDecision();
  const [softNag, setSoftNag] = useState<'pending' | 'show' | 'hide'>('pending');
  const triedImmediate = useRef(false);
  const softVersion = decision.kind === 'soft' ? decision.latestVersion : '';
  const forced = decision.kind === 'forced';

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        triedImmediate.current = false;
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    if (!softVersion) {
      setSoftNag('pending');
      return;
    }
    setSoftNag('pending');
    wasSoftNagDismissedToday(BUNDLE_ID, softVersion).then((dismissed) => {
      if (alive) setSoftNag(dismissed ? 'hide' : 'show');
    });
    return () => {
      alive = false;
    };
  }, [softVersion]);

  useEffect(() => {
    if (!forced || Platform.OS !== 'android' || !installed || triedImmediate.current) return;
    triedImmediate.current = true;
    startAndroidImmediateUpdate(installed).catch(() => false);
  }, [forced, installed]);

  const goToStore = async (url: string) => {
    if (decision.kind === 'forced' && Platform.OS === 'android' && installed) {
      const started = await startAndroidImmediateUpdate(installed);
      if (started) return;
    }
    await openStore(url, Platform.OS, BUNDLE_ID || config?.app?.bundleId || '', appName);
  };

  if (decision.kind === 'forced') {
    return (
      <ForcedScreen
        title="Update required"
        message={decision.message}
        actionLabel="Update"
        onAction={() => {
          void goToStore(decision.storeUrl);
        }}
        footnote={`Installed ${installed} · Required ${decision.minVersion}`}
      />
    );
  }

  if (decision.kind === 'maintenance') {
    return (
      <ForcedScreen
        title="Back shortly"
        message={decision.message}
        actionLabel="Try again"
        onAction={() => {
          void refresh();
        }}
      />
    );
  }

  if (decision.kind === 'soft' && softNag === 'show') {
    return (
      <View style={{ flex: 1 }}>
        {children}
        <SoftNag
          message={decision.message}
          onUpdate={() => {
            void goToStore(decision.storeUrl);
          }}
          onDismiss={() => {
            setSoftNag('hide');
            void dismissSoftNagToday(BUNDLE_ID, decision.latestVersion);
          }}
        />
      </View>
    );
  }

  return <>{children}</>;
}
