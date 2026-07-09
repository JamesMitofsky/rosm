"use client";

// Share a finished run through the Web Share API (mobile browsers). No-ops where
// the API is absent (most desktop browsers).
export function canShare(): boolean {
  return typeof navigator !== "undefined" && !!navigator.share;
}

export async function shareRun(url: string, text: string): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: "ROSM run", text, url });
    }
  } catch {
    /* user cancelled or share unavailable — ignore */
  }
}
