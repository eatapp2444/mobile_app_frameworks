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

test('nil reactNativeFactory logs and preconditionFailure instead of a silent black screen', () => {
  const patched = patchAppDelegate(loadSdk54AppDelegate());
  assert.match(
    patched,
    /guard let factory = appDelegate\.reactNativeFactory else \{\n[\s\S]*NSLog\("withSceneLifecycle: AppDelegate\.reactNativeFactory is nil/,
  );
  assert.match(patched, /preconditionFailure\("withSceneLifecycle: reactNativeFactory is nil"\)/);
  assert.doesNotMatch(patched, /assertionFailure\("withSceneLifecycle: reactNativeFactory is nil"\)/);
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

test('Info.plist names SceneDelegate; AppDelegate does not implement configurationForConnecting', () => {
  const patched = patchAppDelegate(loadSdk54AppDelegate());
  assert.equal(patched.includes('configurationForConnecting'), false);
  assert.doesNotMatch(patched, /delegateClass = SceneDelegate/);
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

function packageRoot(name) {
  return path.dirname(require.resolve(`${name}/package.json`));
}

function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').split('\n');
}

function findLine(lines, pattern) {
  const index = lines.findIndex((line) => pattern.test(line));
  assert.ok(index >= 0, `expected ${pattern} in source`);
  return index + 1;
}

test('Expo 54 ExpoAppDelegate lifecycle methods are open; configurationForConnecting is not declared', () => {
  const expoRoot = packageRoot('expo');
  const coreRoot = packageRoot('expo-modules-core');
  const expoVersion = require(path.join(expoRoot, 'package.json')).version;
  const coreVersion = require(path.join(coreRoot, 'package.json')).version;
  assert.match(expoVersion, /^54\./);
  assert.match(coreVersion, /^3\./);

  const delegatePath = path.join(expoRoot, 'ios/AppDelegates/ExpoAppDelegate.swift');
  const managerPath = path.join(coreRoot, 'ios/AppDelegates/ExpoAppDelegateSubscriberManager.swift');
  assert.equal(fs.existsSync(path.join(coreRoot, 'ios/AppDelegates/ExpoAppDelegate.swift')), false);

  const delegate = readLines(delegatePath);
  const manager = readLines(managerPath);

  assert.match(delegate[13], /open class ExpoAppDelegate: UIResponder,.+UIApplicationDelegate/);
  assert.equal(
    delegate.findIndex((line) => line.includes('configurationForConnecting')),
    -1,
    'Expo 54 ExpoAppDelegate must not declare configurationForConnecting (override would fail xcodebuild)',
  );
  assert.match(delegate[94], /TODO: - Configuring and Discarding Scenes/);

  assert.match(delegate[102], /open func applicationDidBecomeActive\(_ application: UIApplication\)/);
  assert.match(delegate[107], /open func applicationWillResignActive\(_ application: UIApplication\)/);
  assert.match(delegate[112], /open func applicationDidEnterBackground\(_ application: UIApplication\)/);
  assert.match(delegate[116], /open func applicationWillEnterForeground\(_ application: UIApplication\)/);

  findLine(manager, /public static func applicationDidBecomeActive\(_ application: UIApplication\)/);
  findLine(manager, /public static func applicationWillResignActive\(_ application: UIApplication\)/);
  findLine(manager, /public static func applicationDidEnterBackground\(_ application: UIApplication\)/);
  findLine(manager, /public static func applicationWillEnterForeground\(_ application: UIApplication\)/);
  assert.equal(
    manager.findIndex((line) => line.includes('configurationForConnecting')),
    -1,
  );
});

test('ios-compile workflow is manual-trigger only and unsigned simulator xcodebuild', () => {
  const src = fs.readFileSync(path.join(__dirname, '../.github/workflows/ios-compile.yml'), 'utf8');
  assert.match(src, /^on:\n  workflow_dispatch:\n/m);
  assert.match(src, /^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(src, /\bpull_request\b/);
  assert.doesNotMatch(src, /\bpush:\b/);
  assert.match(src, /runs-on: macos-15/);
  assert.match(src, /Xcode_26\*\.app/);
  assert.match(src, /Xcode 26\\\./);
  assert.match(src, /npx expo prebuild --platform ios --clean --no-install/);
  assert.match(src, /EATAPP_BUNDLE_ID: com\.jaihoindia/);
  assert.match(src, /pod install/);
  assert.match(src, /CODE_SIGNING_ALLOWED=NO/);
  assert.match(src, /iphonesimulator/);
});
