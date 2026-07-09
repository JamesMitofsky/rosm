"use client";

import { useEffect } from "react";
import { useOutbox, outboxCounts } from "@/store/outbox";
import { notifySyncPending } from "@/lib/notify";

// Drives the offline outbox app-wide: loads the queue on start, then flushes
// pending edits to OSM whenever we (re)gain connectivity or the tab becomes
// visible again. Mounted once in the root layout. Renders nothing.
export default function OutboxSync() {
  useEffect(() => {
    const { hydrate, flush } = useOutbox.getState();
    hydrate().then(() => flush());

    const flushPending = () => {
      const unsent = outboxCounts(useOutbox.getState().items).unsent;
      if (unsent > 0) notifySyncPending(unsent);
      useOutbox.getState().flush();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") useOutbox.getState().flush();
    };
    document.addEventListener("visibilitychange", onVisible);

    // Connectivity via Capacitor Network — one API for both targets (its web impl
    // wraps navigator.onLine + online/offline). Re-sync queued edits, and nudge the
    // user (native), the moment we're back online.
    let removeNet: (() => void) | undefined;
    import("@capacitor/network").then(({ Network }) => {
      Network.addListener("networkStatusChange", (s) => {
        if (s.connected) flushPending();
      }).then((h) => {
        removeNet = () => h.remove();
      });
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      removeNet?.();
    };
  }, []);

  return null;
}
