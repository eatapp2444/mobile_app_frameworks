import { useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useConfig } from '../src/ConfigProvider';
import { UrlView } from '../src/HtmlView';
import { panesFromConfig } from '../src/tabPanes';

export default function Web() {
  const { url } = useLocalSearchParams<{ url: string; title?: string }>();
  const { config } = useConfig();
  const target = String(url ?? '');
  const keepAlive = useMemo(
    () => panesFromConfig(config).some((p) => p.kind === 'web' && p.url === target),
    [config, target],
  );
  if (keepAlive) {
    return <View style={{ flex: 1, backgroundColor: 'transparent' }} />;
  }
  return <UrlView url={target} />;
}
