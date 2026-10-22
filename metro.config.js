const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  'react-native-device-info': path.resolve(__dirname, 'shims/react-native-device-info.js'),
};
module.exports = config;
