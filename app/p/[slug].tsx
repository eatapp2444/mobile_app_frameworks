import { useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useConfig, useTheme } from '../../src/ConfigProvider';
import { PAGE_UNAVAILABLE_MESSAGE, panesFromConfig } from '../../src/tabPanes';

/**
 * Keep-alive nav pages render in `TabKeepAlive`. Unknown slugs overlay this
 * stack screen so the user sees the empty state instead of a blank WebView.
 */
export default function Page() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { config } = useConfig();
  const theme = useTheme();
  const key = String(slug ?? '').replace(/^\//, '');
  const keepAlive = useMemo(
    () => panesFromConfig(config).some((p) => p.kind === 'page' && p.slug === key),
    [config, key],
  );

  if (keepAlive) {
    return <View style={{ flex: 1, backgroundColor: 'transparent' }} />;
  }

  return (
    <View style={[styles.center, { backgroundColor: theme.background }]}>
      <Text style={{ color: theme.textSecondary }}>{PAGE_UNAVAILABLE_MESSAGE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
