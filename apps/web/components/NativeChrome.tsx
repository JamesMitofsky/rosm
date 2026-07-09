"use client";

import { useEffect } from "react";
import { isNative } from "@/lib/api";

// Native window chrome: match the status bar to the dark theme and dismiss the
// launch splash once the web layer is mounted. No-op on web.
export default function NativeChrome() {
  useEffect(() => {
    if (!isNative()) return;
    (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        // Style.Dark = light text/icons, for our dark (ink) background.
        await StatusBar.setStyle({ style: Style.Dark });
      } catch {
        /* status bar plugin unavailable — ignore */
      }
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        /* splash plugin unavailable — ignore */
      }
    })();
  }, []);
  return null;
}
