import React from 'react';
import { View } from 'react-native';

/** Tab content is rendered by `TabKeepAlive` so the home WebView stays mounted. */
export default function Home() {
  return <View style={{ flex: 1, backgroundColor: 'transparent' }} />;
}
