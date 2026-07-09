"use client";

import { useEffect } from "react";

/**
 * Registers the service worker and applies updates safely:
 * when a new worker finishes installing, it is told to activate, and the
 * page reloads once control passes to it so users get the latest assets.
 *
 * The service worker is the web PWA's offline shell.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let reloading = false;
    // On the first-ever visit the page loads uncontrolled, then the freshly
    // activated worker's `clients.claim()` seizes it — firing `controllerchange`
    // with no prior controller. Reloading there re-runs the whole page (the
    // reveal animations play twice). Only reload when an EXISTING controller is
    // being replaced, i.e. a genuine update.
    const hadController = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (reloading || !hadController) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        const promote = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            // Only auto-activate when an existing controller is being replaced.
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage("SKIP_WAITING");
            }
          });
        };

        if (reg.waiting && navigator.serviceWorker.controller) {
          reg.waiting.postMessage("SKIP_WAITING");
        }
        reg.addEventListener("updatefound", () => promote(reg.installing));
      } catch {
        // Registration failures are non-fatal — app still works online.
      }
    };

    register();
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return null;
}
