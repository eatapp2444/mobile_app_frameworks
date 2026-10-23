import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ANDROID_SCREEN_FADE_DURATION_MS,
  KEEP_ALIVE_SCREEN_ANIMATION,
  SCREEN_FADE_ANIMATION,
  SCREEN_FADE_DURATION_MS,
  SHEET_MODAL_ANIMATION,
  keepAliveScreenTransition,
  overlayScreenTransition,
  screenFadeDurationMs,
  stackGestureEnabled,
} from './screenTransitions';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(join(here, name), 'utf8');
const layout = readFileSync(join(here, '..', 'app', '_layout.tsx'), 'utf8');

test('overlay screens fade; keep-alive tabs do not animate', () => {
  assert.equal(SCREEN_FADE_ANIMATION, 'fade');
  assert.equal(SCREEN_FADE_DURATION_MS, 200);
  assert.equal(KEEP_ALIVE_SCREEN_ANIMATION, 'none');
  assert.equal(SHEET_MODAL_ANIMATION, 'fade');
  assert.deepEqual(overlayScreenTransition(true), {
    animation: 'fade',
    animationDuration: 200,
  });
  assert.deepEqual(overlayScreenTransition(false), {
    animation: 'none',
    animationDuration: 0,
  });
  assert.deepEqual(keepAliveScreenTransition(), {
    animation: 'none',
    animationDuration: 0,
  });
});

test('iOS honours 200ms; Android fade XML is 150ms and ignores animationDuration', () => {
  assert.equal(screenFadeDurationMs('ios'), 200);
  assert.equal(screenFadeDurationMs('android'), ANDROID_SCREEN_FADE_DURATION_MS);
  assert.equal(ANDROID_SCREEN_FADE_DURATION_MS, 150);
  assert.equal(stackGestureEnabled('ios'), true);
  assert.equal(stackGestureEnabled('android'), false);
});

test('stack, overlays, sheets and app-bar title are fade-only (no slide)', () => {
  assert.match(layout, /animation: SCREEN_FADE_ANIMATION/);
  assert.match(layout, /animationDuration: SCREEN_FADE_DURATION_MS/);
  assert.match(layout, /ThemeProvider/);
  assert.match(layout, /contentStyle: \{ backgroundColor: theme\.background \}/);
  assert.doesNotMatch(layout, /slide_from_/);
  assert.doesNotMatch(layout, /animation: 'slide/);

  const tabBar = read('TabBar.tsx');
  assert.match(tabBar, /animationType=\{SHEET_MODAL_ANIMATION\}/);
  assert.doesNotMatch(tabBar, /animationType="slide"/);

  const appBar = read('AppBar.tsx');
  assert.match(appBar, /duration: SCREEN_FADE_DURATION_MS/);
  assert.doesNotMatch(appBar, /translateX/);

  const html = read('HtmlView.tsx');
  assert.match(html, /containerStyle=\{\{ flex: 1, backgroundColor: theme\.background \}\}/);
  const urlView = html.slice(html.indexOf('export function UrlView'));
  assert.equal(urlView.includes('startInLoadingState'), false);
  assert.equal(urlView.includes('Animated.'), false);
});
