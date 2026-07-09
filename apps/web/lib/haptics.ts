"use client";

// Haptic feedback via the Vibration API where supported (a no-op on desktop and
// iOS Safari). Never throws — feedback is a nicety, never a failure path.
export function hapticSuccess(): void {
  try {
    if (typeof navigator !== "undefined") navigator.vibrate?.(35);
  } catch {
    /* vibration unavailable — ignore */
  }
}
