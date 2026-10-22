/**
 * Screen / overlay transitions: fade only. Slide/push felt like too much.
 *
 * Duration:
 * - iOS: native-stack `animationDuration` is passed through as RNSScreen
 *   `transitionDuration` (milliseconds). For `animation: 'fade'` the stack
 *   animator uses that value, so 200ms is honoured.
 * - Android: `ScreenViewManager.setTransitionDuration` is a no-op.
 *   `animation: 'fade'` uses `rns_fade_in` / `rns_fade_out` XML, both
 *   hardcoded to 150ms. That is neither 200ms nor the Android system
 *   activity default (~300ms).
 *
 * Keep-alive tab routes stay `none` so HtmlView's load cover is the only fade
 * and does not stack on top of a screen transition.
 */
export const SCREEN_FADE_ANIMATION = 'fade' as const;
export const SCREEN_FADE_DURATION_MS = 200;
export const ANDROID_SCREEN_FADE_DURATION_MS = 150;
export const KEEP_ALIVE_SCREEN_ANIMATION = 'none' as const;
export const SHEET_MODAL_ANIMATION = 'fade' as const;

export function screenFadeDurationMs(os: 'ios' | 'android' | string): number {
  return os === 'ios' ? SCREEN_FADE_DURATION_MS : ANDROID_SCREEN_FADE_DURATION_MS;
}

/** iOS edge-swipe still pops overlay screens. Android uses the system back button. */
export function stackGestureEnabled(os: 'ios' | 'android' | string): boolean {
  return os === 'ios';
}

export function overlayScreenTransition(isOverlay: boolean): {
  animation: typeof SCREEN_FADE_ANIMATION | typeof KEEP_ALIVE_SCREEN_ANIMATION;
  animationDuration: number;
} {
  if (!isOverlay) {
    return { animation: KEEP_ALIVE_SCREEN_ANIMATION, animationDuration: 0 };
  }
  return {
    animation: SCREEN_FADE_ANIMATION,
    animationDuration: SCREEN_FADE_DURATION_MS,
  };
}

export function keepAliveScreenTransition(): {
  animation: typeof KEEP_ALIVE_SCREEN_ANIMATION;
  animationDuration: number;
} {
  return { animation: KEEP_ALIVE_SCREEN_ANIMATION, animationDuration: 0 };
}
