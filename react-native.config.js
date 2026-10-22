// Do not autolink the unused native module pulled in by
// sp-react-native-in-app-updates; Metro serves a JS shim instead.
module.exports = {
  dependencies: {
    'react-native-device-info': {
      platforms: { android: null, ios: null },
    },
  },
};
