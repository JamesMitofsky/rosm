import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

const TAG = "rosm-run";

export function keepAwake(): void {
  activateKeepAwakeAsync(TAG).catch(() => {});
}

export function allowSleep(): void {
  try {
    deactivateKeepAwake(TAG);
  } catch {
    /* ignore */
  }
}
