"use client";

// Haptic feedback through Capacitor: the Taptic Engine on iOS, the Vibration API on
// the web where supported (a no-op on desktop / iOS Safari). Never throws — feedback
// is a nicety, never a failure path. Lazy-imported to keep it off the initial path.

// Celebratory buzz when an edit is recorded / a point is reached.
export async function hapticSuccess(): Promise<void> {
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* haptics unavailable — ignore */
  }
}
