"use client";

// JS bridge to the native "RunActivity" plugin that drives the iOS Live Activity
// (lock screen + Dynamic Island). Every call is a guarded no-op until the native
// plugin + Widget Extension are added in Xcode (see ios/LiveActivity/SETUP.md), so
// wiring this into the run is safe on web and on an un-extended native build.

import { registerPlugin } from "@capacitor/core";
import { isNative } from "@/lib/api";

export type RunActivityState = {
  nextName: string; // name of the point being navigated to
  distanceToNext: number; // meters; -1 when unknown
  stopsRemaining: number;
  totalStops: number;
};

type RunActivityPlugin = {
  start(state: RunActivityState): Promise<void>;
  update(state: RunActivityState): Promise<void>;
  end(): Promise<void>;
};

let plugin: RunActivityPlugin | null = null;
function get(): RunActivityPlugin | null {
  if (!isNative()) return null;
  if (!plugin) {
    try {
      plugin = registerPlugin<RunActivityPlugin>("RunActivity");
    } catch {
      plugin = null;
    }
  }
  return plugin;
}

export async function startRunActivity(s: RunActivityState): Promise<void> {
  try {
    await get()?.start(s);
  } catch {
    /* plugin/extension not installed — ignore */
  }
}

export async function updateRunActivity(s: RunActivityState): Promise<void> {
  try {
    await get()?.update(s);
  } catch {
    /* ignore */
  }
}

export async function endRunActivity(): Promise<void> {
  try {
    await get()?.end();
  } catch {
    /* ignore */
  }
}
