import Ionicons from '@expo/vector-icons/Ionicons';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  findNavTab,
  hasGroupFlag,
  isTabItemActive,
  moreNavItem,
  sheetFromNavItem,
  type NavSheet,
} from './appLinks';
import { NavItem } from './config';
import { useConfig, useTheme } from './ConfigProvider';
import { ion } from './icons';
import { firstParam, isCmsHost, isExternalUrl, openNavTarget } from './nav';
import { SCREEN_FADE_DURATION_MS, SHEET_MODAL_ANIMATION } from './screenTransitions';
import { useTabActions } from './TabActions';

export function TabBar() {
  const { config } = useConfig();
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ url?: string | string[] }>();
  const webUrl = firstParam(params.url);
  const insets = useSafeAreaInsets();
  const { registerActivateTab } = useTabActions();
  const [sheet, setSheet] = useState<NavSheet | null>(null);

  const nav = config?.navigation ?? {};
  const all = (nav.items ?? []).filter(Boolean);
  const maxVisible = Math.max(2, Math.min(Number(nav.maxVisible ?? 4), 5));
  const visible = all.slice(0, maxVisible);
  const overflow = all.slice(maxVisible);
  const more = moreNavItem(overflow, nav.moreLabel ?? 'More', nav.moreIcon ?? 'MoreHorizontal');

  const go = (item: NavItem) => {
    const next = sheetFromNavItem(item);
    if (next) {
      setSheet(next);
      return;
    }
    // Tabs replace the current screen (single instance, no stacking) and a tap
    // on the already-active tab does nothing.
    openNavTarget(router, item, { current: pathname, replace: true });
  };

  const goRef = useRef(go);
  goRef.current = go;
  const catalogRef = useRef<NavItem[]>(all);
  catalogRef.current = more ? [...all, more] : all;

  useEffect(
    () =>
      registerActivateTab((target) => {
        const item = typeof target === 'string' ? findNavTab(catalogRef.current, target) : target;
        if (!item) return false;
        goRef.current(item);
        return true;
      }),
    [registerActivateTab],
  );

  if (!all.length) return null;

  const routeActive = (item: NavItem) => {
    const target = String(item.url || item.route || '/');
    if (isExternalUrl(target) && !isCmsHost(target)) {
      return pathname.startsWith('/web') && webUrl === target;
    }
    return target === '/' ? pathname === '/' || pathname === '/index' : pathname.endsWith(target);
  };

  const isActive = (item: NavItem) => isTabItemActive(item, routeActive);

  const cell = (item: NavItem, key: string) => {
    const active = isActive(item);
    const group = hasGroupFlag(item);
    return (
      <Pressable key={key} style={styles.tab} onPress={() => go(item)}>
        <Ionicons name={ion(item.icon)} size={22} color={active ? theme.tabActive : theme.tabInactive} />
        <Text
          numberOfLines={1}
          style={[
            styles.tabLabel,
            { color: active ? theme.tabActive : theme.tabInactive, fontFamily: theme.fontFamilyRN },
          ]}
        >
          {item.label}
          {group ? ' ›' : ''}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.tabBar,
            borderTopColor: theme.border,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
      >
        {visible.map((item, i) => cell(item, item.id ?? String(i)))}
        {more ? cell(more, '__more') : null}
      </View>

      <Modal visible={!!sheet} transparent animationType={SHEET_MODAL_ANIMATION} onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)} />
        <View
          style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <Text testID="nav-sheet-title" style={[styles.sheetTitle, { color: theme.text }]}>
            {sheet?.title}
          </Text>
          <ScrollView>
            {(sheet?.items ?? []).map((child, i) => (
              <Pressable
                key={child.id ?? String(i)}
                style={[styles.row, { borderBottomColor: theme.border }]}
                onPress={() => {
                  setSheet(null);
                  setTimeout(() => go(child), SCREEN_FADE_DURATION_MS);
                }}
              >
                <Ionicons name={ion(child.icon)} size={20} color={theme.primary} />
                <Text style={[styles.rowLabel, { color: theme.text }]}>{child.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  tabLabel: { fontSize: 11, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '70%',
  },
  grabber: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
});
