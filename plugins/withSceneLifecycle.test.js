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

const FIXTURE = path.join(__dirname, '__fixtures__/sdk54-AppDelegate.swift');

function loadSdk54AppDelegate() {
  return fs.readFileSync(FIXTURE, 'utf8').replace(/\r\n/g, '\n');
}

test('fixture is real Expo 54 prebuild output containing the window block', () => {
  const src = loadSdk54AppDelegate();
  assert.match(src, /Captured from: npx expo prebuild --platform ios --clean --no-install/);
  assert.match(src, /expo@54\.0\.37/);
  assert.ok(src.includes(WINDOW_BLOCK), 'prebuild fixture must contain the Expo 54 window block');
  assert.match(src, /@UIApplicationMain/);
  assert.match(src, /bindReactNativeFactory\(factory\)/);
  assert.match(src, /RCTLinkingManager\.application\(app, open: url, options: options\)/);
});

test('patchAppDelegate moves the window onto SceneDelegate and keeps linking', () => {
  const patched = patchAppDelegate(loadSdk54AppDelegate());

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

test('nil reactNativeFactory logs and assertionFailure instead of a silent black screen', () => {
  const patched = patchAppDelegate(loadSdk54AppDelegate());
  assert.match(
    patched,
    /guard let factory = appDelegate\.reactNativeFactory else \{\n[\s\S]*NSLog\("withSceneLifecycle: AppDelegate\.reactNativeFactory is nil/,
  );
  assert.match(patched, /assertionFailure\("withSceneLifecycle: reactNativeFactory is nil"\)/);
  assert.doesNotMatch(
    patched,
    /let windowScene = scene as\? UIWindowScene,\n\s*let appDelegate = UIApplication\.shared\.delegate as\? AppDelegate,\n\s*let factory = appDelegate\.reactNativeFactory\n\s*else \{ return \}/,
  );
});

test('SceneDelegate forwards ExpoAppDelegate active/background subscribers', () => {
  const patched = patchAppDelegate(loadSdk54AppDelegate());
  assert.match(
    patched,
    /func sceneDidBecomeActive\(_ scene: UIScene\) \{\n\s*guard let appDelegate = UIApplication\.shared\.delegate as\? AppDelegate else \{ return \}\n\s*appDelegate\.applicationDidBecomeActive\(UIApplication\.shared\)/,
  );
  assert.match(
    patched,
    /func sceneDidEnterBackground\(_ scene: UIScene\) \{\n\s*guard let appDelegate = UIApplication\.shared\.delegate as\? AppDelegate else \{ return \}\n\s*appDelegate\.applicationDidEnterBackground\(UIApplication\.shared\)/,
  );
  assert.match(patched, /appDelegate\.applicationWillResignActive\(UIApplication\.shared\)/);
  assert.match(patched, /appDelegate\.applicationWillEnterForeground\(UIApplication\.shared\)/);
});

test('AppDelegate configurationForConnecting names SceneDelegate and Default Configuration', () => {
  const patched = patchAppDelegate(loadSdk54AppDelegate());
  assert.match(
    patched,
    /configurationForConnecting connectingSceneSession: UISceneSession[\s\S]*UISceneConfiguration\(\n\s*name: "Default Configuration",\n\s*sessionRole: connectingSceneSession\.role\n\s*\)[\s\S]*configuration\.delegateClass = SceneDelegate\.self/,
  );
  assert.equal(SCENE_MANIFEST.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneConfigurationName, 'Default Configuration');
  assert.equal(
    SCENE_MANIFEST.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName,
    '$(PRODUCT_MODULE_NAME).SceneDelegate',
  );
});

test('patchAppDelegate is idempotent once the marker is present', () => {
  const once = patchAppDelegate(loadSdk54AppDelegate());
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
        loadSdk54AppDelegate().replace(
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
