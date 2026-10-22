import React from 'react';
import { View } from 'react-native';

/** Tab / page content is rendered by `TabKeepAlive` so each WebView stays mounted. */
export default function Page() {
  return <View style={{ flex: 1, backgroundColor: 'transparent' }} />;
}
