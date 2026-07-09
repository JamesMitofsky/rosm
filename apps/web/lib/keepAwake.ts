"use client";

// Keep the screen on during an active run (replaces the missing web Wake Lock).
// No-ops on web; never throws.

import { isNative } from "@/lib/api";

export async function keepAwake(): Promise<void> {
  if (!isNative()) return;
  try {
    const { KeepAwake } = await import("@capacitor-community/keep-awake");
    await KeepAwake.keepAwake();
  } catch {
    /* ignore */
  }
}

export async function allowSleep(): Promise<void> {
  if (!isNative()) return;
  try {
    const { KeepAwake } = await import("@capacitor-community/keep-awake");
    await KeepAwake.allowSleep();
  } catch {
    /* ignore */
  }
}
