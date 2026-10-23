/**
 * JS-only stand-in for `react-native-device-info`.
 *
 * `sp-react-native-in-app-updates` imports getVersion / getBundleId. We already
 * ship `expo-application`, so a native device-info module is unnecessary and
 * its old pin would fight Expo SDK 54 autolinking. Metro aliases the package
 * here; `react-native.config.js` also skips native autolink.
 */
const Application = require('expo-application');
const Constants = require('expo-constants').default;

function extra() {
  return (Constants.expoConfig && Constants.expoConfig.extra) || {};
}

function getBundleId() {
  return (
    Application.applicationId ||
    extra().EATAPP_BUNDLE_ID ||
    (Constants.expoConfig &&
      (Constants.expoConfig.android?.package || Constants.expoConfig.ios?.bundleIdentifier)) ||
    ''
  );
}

function getVersion() {
  return (
    Application.nativeApplicationVersion ||
    Constants.nativeAppVersion ||
    (Constants.expoConfig && Constants.expoConfig.version) ||
    '0.0.0'
  );
}

module.exports = { getBundleId, getVersion, default: { getBundleId, getVersion } };
