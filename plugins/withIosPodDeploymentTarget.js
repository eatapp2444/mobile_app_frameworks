/**
 * Floor every CocoaPods target (including resource bundles) to iOS 15.1+.
 *
 * Xcode 27 turns a deployment target below 15.0 into a hard archive error.
 * React Native's react_native_post_install only updates each pod's native
 * target, so resource bundles such as RNCAsyncStorage-RNCAsyncStorage_resources
 * keep the podspec value (13.4) and fail EAS `Run fastlane`.
 *
 * This plugin is applied from app.config.js so every EatApp client built from
 * this repo gets the same floor. It does not change JS/runtime behaviour.
 */
const DEFAULT_MIN = '15.1';
const BEGIN = '# BEGIN eatapp-ios-min-deployment-target';
const END = '# END eatapp-ios-min-deployment-target';

function assertVersion(value) {
  if (typeof value !== 'string' || !/^\d+(\.\d+)*$/.test(value)) {
    throw new Error('Invalid iOS deployment target: ' + value);
  }
  return value;
}

function snippet(min) {
  return (
    '\n' +
    '    ' +
    BEGIN +
    '\n' +
    "    installer.pods_project.targets.each do |target|\n" +
    '      target.build_configurations.each do |cfg|\n' +
    "        current = cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET']\n" +
    '        if current.nil? || current.to_f < ' +
    min +
    ".to_f\n" +
    "          cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '" +
    min +
    "'\n" +
    '        end\n' +
    '      end\n' +
    '    end\n' +
    '    ' +
    END +
    '\n'
  );
}

function stripExisting(contents) {
  const start = contents.indexOf(BEGIN);
  if (start === -1) return contents;
  const end = contents.indexOf(END, start);
  if (end === -1) return contents;
  let from = start;
  while (from > 0 && contents[from - 1] === ' ') from--;
  if (from > 0 && contents[from - 1] === '\n') from--;
  let to = end + END.length;
  if (contents[to] === '\n') to++;
  return contents.slice(0, from) + contents.slice(to);
}

function indexAfterCall(contents, fnName) {
  const start = contents.indexOf(fnName + '(');
  if (start === -1) return -1;
  let depth = 0;
  for (let i = start + fnName.length; i < contents.length; i++) {
    const ch = contents[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function injectPodfileHook(contents, min) {
  const version = assertVersion(min || DEFAULT_MIN);
  const next = stripExisting(contents);
  const block = snippet(version);
  const afterRn = indexAfterCall(next, 'react_native_post_install');
  if (afterRn !== -1) {
    return next.slice(0, afterRn) + block + next.slice(afterRn);
  }
  if (/post_install do \|installer\|/.test(next)) {
    return next.replace(/post_install do \|installer\|/, (match) => match + block);
  }
  return next + '\npost_install do |installer|\n' + block + 'end\n';
}

function withIosPodDeploymentTarget(config, props) {
  const { withPodfile } = require('expo/config-plugins');
  const min = (props && props.deploymentTarget) || DEFAULT_MIN;
  assertVersion(min);
  return withPodfile(config, (cfg) => {
    cfg.modResults.contents = injectPodfileHook(cfg.modResults.contents, min);
    return cfg;
  });
}

module.exports = withIosPodDeploymentTarget;
module.exports.injectPodfileHook = injectPodfileHook;
module.exports.DEFAULT_MIN = DEFAULT_MIN;
