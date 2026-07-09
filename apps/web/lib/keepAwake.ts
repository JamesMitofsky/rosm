"use client";

// Keep the screen on during an active run via the Screen Wake Lock API. No-op
// where unsupported (older iOS Safari); never throws.
const holder: { sentinel: WakeLockSentinel | null } = { sentinel: null };

export async function keepAwake(): Promise<void> {
  try {
    holder.sentinel = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    /* wake lock denied / unavailable — ignore */
  }
}

export async function allowSleep(): Promise<void> {
  try {
    await holder.sentinel?.release();
    holder.sentinel = null;
  } catch {
    /* ignore */
  }
}
