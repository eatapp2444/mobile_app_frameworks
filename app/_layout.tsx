import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import Constants from 'expo-constants';
import { Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppBar } from '../src/AppBar';
import { ConfigProvider, useConfig, useTheme } from '../src/ConfigProvider';
import { TabKeepAlive } from '../src/TabKeepAlive';
import { TabBar } from '../src/TabBar';
import { UpdateGate } from '../src/UpdateGate';
import { SplashOverlay } from '../src/SplashOverlay';
import { firstParam } from '../src/navCore';
import {
  SCREEN_FADE_ANIMATION,
  SCREEN_FADE_DURATION_MS,
  keepAliveScreenTransition,
  overlayScreenTransition,
  stackGestureEnabled,
} from '../src/screenTransitions';
import { isOverlayPath, panesFromConfig } from '../src/tabPanes';

SplashScreen.preventAutoHideAsync().catch(() => {});

function useOneSignal(appId?: string) {
  useEffect(() => {
    if (!appId) return;
    (async () => {
      try {
        const { OneSignal } = await import('react-native-onesignal');
        OneSignal.initialize(appId);
        OneSignal.Notifications.requestPermission(true);
      } catch {
        /* OneSignal is unavailable in Expo Go — ignore */
      }
    })();
  }, [appId]);
}

function Shell() {
  const { config, loading } = useConfig();
  const theme = useTheme();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ url?: string | string[]; title?: string | string[] }>();
  const webUrl = firstParam(params.url);
  const webTitle = firstParam(params.title);
  useOneSignal(config?.onesignal?.appId);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  const paneKeys = useMemo(() => panesFromConfig(config).map((p) => p.key), [config]);
  const overlay = isOverlayPath(pathname, webUrl, paneKeys);
  const overlayTransition = overlayScreenTransition(overlay);
  const keepAliveTransition = keepAliveScreenTransition();
  const navTheme = useMemo(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        background: theme.background,
        card: theme.card,
        primary: theme.primary,
        text: theme.text,
        border: theme.border,
      },
    }),
    [theme],
  );

  const isHome = pathname === '/' || pathname === '/index';
  const subTitle = pathname.startsWith('/notifications')
    ? 'Notifications'
    : pathname.startsWith('/web')
      ? webTitle
      : (config?.pages ?? []).find((p) => pathname.endsWith(String(p.slug ?? '')))?.title ?? '';

  return (
    <ThemeProvider value={navTheme}>
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar style={theme.appBarText === '#FFFFFF' ? 'light' : 'dark'} />
      <AppBar title={isHome ? undefined : subTitle} showBack={!isHome} />
      <View style={[styles.body, { backgroundColor: theme.background }]}>
        <View
          style={[styles.stackLayer, overlay ? styles.front : styles.back]}
          pointerEvents={overlay ? 'auto' : 'box-none'}
        >
          <Stack
            screenOptions={{
              headerShown: false,
              animation: SCREEN_FADE_ANIMATION,
              animationDuration: SCREEN_FADE_DURATION_MS,
              gestureEnabled: stackGestureEnabled(Platform.OS),
              animationMatchesGesture: false,
              fullScreenGestureEnabled: false,
              contentStyle: { backgroundColor: theme.background },
            }}
          >
            <Stack.Screen
              name="index"
              options={{
                ...keepAliveTransition,
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
            <Stack.Screen
              name="p/[slug]"
              options={{
                ...overlayTransition,
                contentStyle: {
                  backgroundColor: overlay ? theme.background : 'transparent',
                },
              }}
            />
            <Stack.Screen
              name="web"
              options={{
                ...overlayTransition,
                contentStyle: {
                  backgroundColor: overlay ? theme.background : 'transparent',
                },
              }}
            />
            <Stack.Screen
              name="notifications"
              options={{
                animation: SCREEN_FADE_ANIMATION,
                animationDuration: SCREEN_FADE_DURATION_MS,
                contentStyle: { backgroundColor: theme.background },
              }}
            />
          </Stack>
        </View>
        <View
          collapsable={false}
          pointerEvents={overlay ? 'none' : 'auto'}
          style={[styles.keepAlive, { backgroundColor: theme.background }, overlay ? styles.back : styles.front]}
        >
          <TabKeepAlive pathname={pathname} webUrl={webUrl} interactive={!overlay} />
        </View>
      </View>
      <TabBar />
    </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  void Constants.expoConfig?.extra;
  return (
    <SafeAreaProvider>
      <ConfigProvider>
        <UpdateGate>
          <Shell />
        </UpdateGate>
        <SplashOverlay />
      </ConfigProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  stackLayer: { flex: 1 },
  keepAlive: { ...StyleSheet.absoluteFillObject },
  front: { zIndex: 2, elevation: 2 },
  back: { zIndex: 0, elevation: 0 },
});
