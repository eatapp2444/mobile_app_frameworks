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
 *
 * Scene lifecycle also stops UIKit calling applicationDidBecomeActive /
 * applicationDidEnterBackground. ExpoAppDelegate subscribers still listen on
 * those AppDelegate methods (expo/ios/AppDelegates/ExpoAppDelegate.swift), so
 * SceneDelegate forwards sceneDidBecomeActive / sceneDidEnterBackground (and
 * resign/foreground) through AppDelegate, matching expo/expo#49925. The
 * Info.plist UIApplicationSceneManifest already names SceneDelegate, so
 * AppDelegate does not implement configurationForConnecting.
 *
 * A nil reactNativeFactory is a contract violation (didFinishLaunching always
 * assigns it before the first scene connects). Lazily creating the factory
 * here would duplicate ExpoReactNativeFactory / RCTAppDependencyProvider /
 * bindReactNativeFactory and can start RN twice. We NSLog + preconditionFailure
 * so Release builds crash with that name instead of showing a blank window.
 *
 * A new UIWindow has a nil background, which UIKit composites as black. That
 * window replaces the launch storyboard as soon as React Native starts, so a
 * white splash flashes black for a frame. SceneDelegate sets
 * window.backgroundColor to the expo-splash-screen / splash backgroundColor
 * before startReactNative (white if none is configured).
 */
const MARKER = '// scene lifecycle (withSceneLifecycle.js)';
const DEFAULT_WINDOW_BACKGROUND = '#FFFFFF';

function pluginName(entry) {
  if (typeof entry === 'string') return entry;
  if (Array.isArray(entry)) return entry[0];
  return '';
}

function pluginProps(entry) {
  return Array.isArray(entry) && entry[1] && typeof entry[1] === 'object' ? entry[1] : null;
}

function normalizeHexColor(input) {
  if (typeof input !== 'string') return null;
  let hex = input.trim();
  if (hex.charAt(0) === '#') hex = hex.slice(1);
  if (!/^[0-9A-Fa-f]+$/.test(hex)) return null;
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (hex.length !== 6) return null;
  return '#' + hex.toUpperCase();
}

function resolveSplashBackgroundColor(config, props) {
  const fromProps = normalizeHexColor(props && props.backgroundColor);
  if (fromProps) return fromProps;

  const plugins = (config && config.plugins) || [];
  for (let i = 0; i < plugins.length; i++) {
    const name = String(pluginName(plugins[i]) || '');
    if (name.indexOf('expo-splash-screen') === -1) continue;
    const splashProps = pluginProps(plugins[i]);
    const fromPlugin = normalizeHexColor(splashProps && splashProps.backgroundColor);
    if (fromPlugin) return fromPlugin;
  }

  const splash =
    (config && config.splash && config.splash.backgroundColor) ||
    (config && config.ios && config.ios.splash && config.ios.splash.backgroundColor);
  return normalizeHexColor(splash) || DEFAULT_WINDOW_BACKGROUND;
}

function uiColorChannel(n) {
  if (n === 255) return '1.0';
  if (n === 0) return '0.0';
  return n + '.0 / 255.0';
}

function uiColorLiteral(hex) {
  const normalized = normalizeHexColor(hex) || DEFAULT_WINDOW_BACKGROUND;
  const h = normalized.slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (
    'UIColor(red: ' +
    uiColorChannel(r) +
    ', green: ' +
    uiColorChannel(g) +
    ', blue: ' +
    uiColorChannel(b) +
    ', alpha: 1.0)'
  );
}

// Exact block from Expo SDK 54.0.37's generated AppDelegate.swift
// (captured by `npx expo prebuild --platform ios --clean --no-install`).
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

function sceneDelegateSource(backgroundColor) {
  const uiColor = uiColorLiteral(backgroundColor);
  return `
${MARKER}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      NSLog("withSceneLifecycle: connecting scene is not a UIWindowScene (%@)", String(describing: type(of: scene)))
      assertionFailure("withSceneLifecycle: expected UIWindowScene")
      return
    }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      NSLog("withSceneLifecycle: UIApplication.shared.delegate is not AppDelegate (%@)", String(describing: UIApplication.shared.delegate))
      assertionFailure("withSceneLifecycle: expected AppDelegate")
      return
    }
    guard let factory = appDelegate.reactNativeFactory else {
      NSLog("withSceneLifecycle: AppDelegate.reactNativeFactory is nil; didFinishLaunchingWithOptions did not finish React Native setup. Refusing to show a blank window.")
      preconditionFailure("withSceneLifecycle: reactNativeFactory is nil")
    }

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
    // UIWindow defaults to a nil (black) background. Paint it before RN starts
    // so the first frame matches the launch storyboard instead of flashing.
    window.backgroundColor = ${uiColor}
    self.window = window
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions.isEmpty ? nil : launchOptions)
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    appDelegate.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    appDelegate.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    appDelegate.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    appDelegate.applicationDidEnterBackground(UIApplication.shared)
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
}

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

function patchAppDelegate(contents, backgroundColor) {
  const next = String(contents).replace(/\r\n/g, '\n');
  if (next.includes(MARKER)) return next;
  if (!next.includes(WINDOW_BLOCK)) {
    throw missingBlockError(next);
  }
  return next.replace(WINDOW_BLOCK, WINDOW_REPLACEMENT) + sceneDelegateSource(backgroundColor);
}

function applySceneManifest(plist) {
  const next = Object.assign({}, plist);
  next.UIApplicationSceneManifest = SCENE_MANIFEST;
  return next;
}

function withSceneLifecycle(config, props) {
  const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');
  const backgroundColor = resolveSplashBackgroundColor(config, props);

  config = withInfoPlist(config, (mod) => {
    mod.modResults = applySceneManifest(mod.modResults);
    return mod;
  });

  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle expects a Swift AppDelegate (Expo SDK 54 template).');
    }
    mod.modResults.contents = patchAppDelegate(mod.modResults.contents, backgroundColor);
    return mod;
  });
}

module.exports = withSceneLifecycle;
module.exports.patchAppDelegate = patchAppDelegate;
module.exports.applySceneManifest = applySceneManifest;
module.exports.WINDOW_BLOCK = WINDOW_BLOCK;
module.exports.MARKER = MARKER;
module.exports.SCENE_MANIFEST = SCENE_MANIFEST;
module.exports.DEFAULT_WINDOW_BACKGROUND = DEFAULT_WINDOW_BACKGROUND;
module.exports.normalizeHexColor = normalizeHexColor;
module.exports.resolveSplashBackgroundColor = resolveSplashBackgroundColor;
module.exports.uiColorLiteral = uiColorLiteral;
