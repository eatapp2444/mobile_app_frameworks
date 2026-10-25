const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  MARKER,
  WINDOW_BLOCK,
  SCENE_MANIFEST,
  applySceneManifest,
  patchAppDelegate,
} = require('./withSceneLifecycle');

const EXPO_54_APP_DELEGATE = `import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
`;

test('WINDOW_BLOCK is the Expo 54.0.37 generated template text', () => {
  assert.equal(
    WINDOW_BLOCK,
    '#if os(iOS) || os(tvOS)\n' +
      '    window = UIWindow(frame: UIScreen.main.bounds)\n' +
      '    factory.startReactNative(\n' +
      '      withModuleName: "main",\n' +
      '      in: window,\n' +
      '      launchOptions: launchOptions)\n' +
      '#endif\n',
  );
  assert.ok(EXPO_54_APP_DELEGATE.includes(WINDOW_BLOCK));
});

test('patchAppDelegate moves the window onto SceneDelegate and keeps linking', () => {
  const patched = patchAppDelegate(EXPO_54_APP_DELEGATE);

  assert.ok(patched.includes(MARKER));
  assert.ok(patched.includes('class SceneDelegate: UIResponder, UIWindowSceneDelegate'));
  assert.ok(patched.includes('func scene(\n    _ scene: UIScene,\n    willConnectTo session: UISceneSession,'));
  assert.ok(patched.includes('factory.startReactNative(\n      withModuleName: "main",\n      in: window,'));
  assert.ok(patched.includes('func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>)'));
  assert.ok(patched.includes('func scene(_ scene: UIScene, continue userActivity: NSUserActivity)'));
  assert.ok(patched.includes('appDelegate.application(UIApplication.shared, open: context.url, options: [:])'));
  assert.ok(patched.includes('bindReactNativeFactory(factory)'));
  assert.ok(patched.includes('RCTLinkingManager.application(app, open: url, options: options)'));
  assert.ok(patched.includes('continue userActivity: NSUserActivity'));

  assert.equal(patched.includes('window = UIWindow(frame: UIScreen.main.bounds)'), false);
  assert.match(patched, /didFinishLaunchingWithOptions[\s\S]*bindReactNativeFactory\(factory\)/);
  assert.doesNotMatch(
    patched,
    /didFinishLaunchingWithOptions[\s\S]*window = UIWindow\(frame: UIScreen\.main\.bounds\)/,
  );
  assert.match(
    patched,
    /willConnectTo session: UISceneSession[\s\S]*UIWindow\(windowScene: windowScene\)[\s\S]*startReactNative/,
  );
});

test('patchAppDelegate is idempotent once the marker is present', () => {
  const once = patchAppDelegate(EXPO_54_APP_DELEGATE);
  const twice = patchAppDelegate(once);
  assert.equal(twice, once);
  assert.equal(once.split(MARKER).length - 1, 1);
});

test('patchAppDelegate fails loudly when the Expo 54 window block is missing', () => {
  assert.throws(
    () => patchAppDelegate('class AppDelegate: ExpoAppDelegate {}'),
    /Expo SDK 54 AppDelegate window block was not found/,
  );
  assert.throws(
    () =>
      patchAppDelegate(
        EXPO_54_APP_DELEGATE.replace(
          'window = UIWindow(frame: UIScreen.main.bounds)',
          'window = UIWindow(windowScene: scene)',
        ),
      ),
    /does not match the SDK 54 template byte-for-byte/,
  );
});

test('applySceneManifest points Info.plist at SceneDelegate', () => {
  const plist = applySceneManifest({ CFBundleDisplayName: 'Jai Ho Indian' });
  assert.equal(plist.CFBundleDisplayName, 'Jai Ho Indian');
  assert.deepEqual(plist.UIApplicationSceneManifest, SCENE_MANIFEST);
  assert.equal(
    plist.UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0]
      .UISceneDelegateClassName,
    '$(PRODUCT_MODULE_NAME).SceneDelegate',
  );
});

test('app.config.js registers withSceneLifecycle next to the pod floor', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app.config.js'), 'utf8');
  assert.match(
    src,
    /withIosPodDeploymentTarget[\s\S]*plugins\.push\('\.\/plugins\/withSceneLifecycle'\)/,
  );
});
