"use client";

// The iOS Live Activity (lock screen + Dynamic Island) is a native affordance; on
// the web these are no-ops. Kept as stable entry points so useRunSession stays
// platform-neutral. RunActivityState lives in @rosm/core/ports; the Expo app
// provides the real implementation.
import type { RunActivityState } from "@rosm/core/ports";

export async function startRunActivity(_s: RunActivityState): Promise<void> {}

export async function updateRunActivity(_s: RunActivityState): Promise<void> {}

export async function endRunActivity(): Promise<void> {}
