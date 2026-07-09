"use client";

// Run notifications are a native affordance (lock-screen proximity / completion
// alerts); on the web the run UI is on-screen, so these are no-ops. Kept as stable
// entry points so useRunSession + OutboxSync stay platform-neutral — the Expo app
// provides the real implementations.
export async function ensureNotifyPermission(): Promise<boolean> {
  return false;
}

export function notifyProximity(_name: string, _meters: number): void {}

export function notifyRunComplete(_count: number): void {}

export function notifySyncPending(_count: number): void {}
