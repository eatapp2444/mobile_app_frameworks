/**
 * Adopt the UIKit scene lifecycle in the Expo SDK 54 prebuild output.
 *
 * Apps built with the iOS 27 SDK (Xcode 27 / EAS `latest`) fail to launch on
 * iOS 27 unless they declare UIApplicationSceneManifest and create the window
 * from a UIWindowScene. Expo 54's AppDelegate still owns the window in
 * didFinishLaunchingWithOptions (expo/expo#46664). SDK 57's
 * ios.enableSceneSupport and SDK 58's template fix this upstream, but this
 * repo stays on Expo 54 / RN 0.81.5, so every client prebuild gets the same
 * patch from app.config.js.
 *
 * eatapp:// links used in homepage HTML are intercepted in JS (src/appLinks.ts)
 * and never reach UIKit. Native custom-scheme and universal links do, and under
 * scenes UIKit delivers them to the scene delegate instead of AppDelegate.
 * This plugin forwards those to the generated AppDelegate handlers so
 * expo-linking, expo-router, and RCTLinkingManager keep working. OneSignal is
 * initialised from JS after RN starts and uses a Notification Service
 * Extension — this plugin does not edit those.
 */
const MARKER = '// scene lifecycle (withSceneLifecycle.js)';

// Exact block from Expo SDK 54.0.37's generated AppDelegate.swift.
const WINDOW_BLOCK =
  '#if os(iOS) || os(tvOS)\n' +
  '    window = UIWindow(frame: UIScreen.main.bounds)\n' +
  '    factory.startReactNative(\n' +
  '      withModuleName: "main",\n' +
  '      in: window,\n' +
  '      launchOptions: launchOptions)\n' +
  '#endif\n';

const WINDOW_REPLACEMENT =
  '    // Window and React Native start in SceneDelegate (UIKit scene lifecycle).\n';

const SCENE_DELEGATE = `
${MARKER}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else { return }

    // Cold-start links arrive here, not in AppDelegate launchOptions.
    // Forward them through AppDelegate before RN starts so expo-linking
    // records the initial URL, and also put them in launchOptions for
    // RCTLinkingManager. Nothing is listening yet, so nothing hears it twice.
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
      _ = appDelegate.application(UIApplication.shared, open: url, options: [:])
    } else if let activity = connectionOptions.userActivities.first(where: {
      $0.activityType == NSUserActivityTypeBrowsingWeb
    }), let url = activity.webpageURL {
      launchOptions[.url] = url
      _ = appDelegate.application(
        UIApplication.shared,
        continue: activity,
        restorationHandler: { _ in })
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions.isEmpty ? nil : launchOptions)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in })
  }
}
`;

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      },
    ],
  },
};

function missingBlockError(contents) {
  const stillStartsRn = contents.includes('startReactNative');
  return new Error(
    'withSceneLifecycle: Expo SDK 54 AppDelegate window block was not found. ' +
      (stillStartsRn
        ? 'AppDelegate still starts React Native, but the window block does not match the SDK 54 template byte-for-byte. '
        : 'AppDelegate no longer contains factory.startReactNative. ') +
      'If another plugin edited that block, this plugin has to match its output. ' +
      'If this Expo SDK ships UIScene itself (SDK 58+), remove this plugin.',
  );
}

function patchAppDelegate(contents) {
  const next = String(contents).replace(/\r\n/g, '\n');
  if (next.includes(MARKER)) return next;
  if (!next.includes(WINDOW_BLOCK)) {
    throw missingBlockError(next);
  }
  return next.replace(WINDOW_BLOCK, WINDOW_REPLACEMENT) + SCENE_DELEGATE;
}

function applySceneManifest(plist) {
  const next = Object.assign({}, plist);
  next.UIApplicationSceneManifest = SCENE_MANIFEST;
  return next;
}

function withSceneLifecycle(config) {
  const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

  config = withInfoPlist(config, (mod) => {
    mod.modResults = applySceneManifest(mod.modResults);
    return mod;
  });

  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle expects a Swift AppDelegate (Expo SDK 54 template).');
    }
    mod.modResults.contents = patchAppDelegate(mod.modResults.contents);
    return mod;
  });
}

module.exports = withSceneLifecycle;
module.exports.patchAppDelegate = patchAppDelegate;
module.exports.applySceneManifest = applySceneManifest;
module.exports.WINDOW_BLOCK = WINDOW_BLOCK;
module.exports.MARKER = MARKER;
module.exports.SCENE_MANIFEST = SCENE_MANIFEST;
