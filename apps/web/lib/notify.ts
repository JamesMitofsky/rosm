"use client";

// Local notifications for the run (native only; no-ops on web, never throws).
// One fixed id per category so a newer notification of a kind replaces the older
// one rather than stacking.

import { isNative } from "@/lib/api";

const ID = { proximity: 200, complete: 201, sync: 202 } as const;

let asked = false;
let granted = false;

// Ask once (at run start); thereafter just report the cached grant.
export async function ensureNotifyPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const res = asked
      ? await LocalNotifications.checkPermissions()
      : await LocalNotifications.requestPermissions();
    asked = true;
    granted = res.display === "granted";
  } catch {
    granted = false;
  }
  return granted;
}

async function notify(id: number, title: string, body: string): Promise<void> {
  if (!isNative()) return;
  try {
    if (!granted && !(await ensureNotifyPermission())) return;
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({ notifications: [{ id, title, body }] });
  } catch {
    /* ignore — notifications are best-effort */
  }
}

export function notifyProximity(name: string, meters: number): Promise<void> {
  return notify(
    ID.proximity,
    "Survey point ahead",
    `${name} — about ${Math.round(meters)} m away.`,
  );
}

export function notifyRunComplete(count: number): Promise<void> {
  return notify(
    ID.complete,
    "Run complete",
    `You surveyed ${count} ${count === 1 ? "point" : "points"}. Nice work!`,
  );
}

export function notifySyncPending(count: number): Promise<void> {
  return notify(
    ID.sync,
    "Edits uploading",
    `Back online — sending your ${count} pending ${count === 1 ? "edit" : "edits"} to OpenStreetMap.`,
  );
}
