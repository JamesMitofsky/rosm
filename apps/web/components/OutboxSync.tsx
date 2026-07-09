"use client";

import { useEffect } from "react";
import { useOutbox } from "@rosm/core/stores/outbox";

// Drives the offline outbox app-wide: loads the queue on start, then flushes
// pending edits to OSM whenever we (re)gain connectivity or the tab becomes
// visible again. Mounted once in the root layout. Renders nothing.
export default function OutboxSync() {
  useEffect(() => {
    const { hydrate, flush } = useOutbox.getState();
    hydrate().then(() => flush());

    const flushPending = () => useOutbox.getState().flush();

    const onVisible = () => {
      if (document.visibilityState === "visible") flushPending();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Re-sync queued edits the moment the browser reports we're back online.
    window.addEventListener("online", flushPending);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", flushPending);
    };
  }, []);

  return null;
}
