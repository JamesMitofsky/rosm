"use client";

// Share a finished run through Capacitor — the iOS share sheet natively, the Web
// Share API on the PWA (the plugin's web implementation). No-ops if unavailable.

import { isNative } from "@/lib/api";

// Whether to offer a share affordance: native always; web only where the Web Share
// API exists (which is exactly what Capacitor's web Share impl drives).
export function canShare(): boolean {
  return isNative() || (typeof navigator !== "undefined" && !!navigator.share);
}

export async function shareRun(url: string, text: string): Promise<void> {
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: "Fountain Mapper run", text, url });
  } catch {
    /* user cancelled or share unavailable — ignore */
  }
}
