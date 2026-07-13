"use client";

import { useEffect, useState } from "react";
import { watchPosition, type GeoWatch } from "@/lib/geolocation";
import { useHeading } from "@/lib/useHeading";
import { MOVE_MIN_SPEED } from "@/lib/geo";

// The live blue dot + heading cone for any map that shows the user — the same
// treatment the run screen gets, minus the background tracking that only an
// armed run needs. A foreground GPS watch keeps the dot on the user as they move,
// and the device compass (GPS travel direction as fallback) orients the cone.
//
// `enabled` gates the GPS watch so a map can defer it until the user opts into
// location (e.g. after a consent gate). The compass listener is harmless and
// always attached; `needsCompassPermission`/`requestCompass` drive the same
// CompassEnableModal the run uses on iOS.
export function useLiveLocation({ enabled = true }: { enabled?: boolean } = {}) {
  const [pos, setPos] = useState<[number, number] | null>(null);
  // GPS travel direction (only while moving) — orients the map/cone while moving.
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  // Whether the user is moving — picks travel direction vs. device compass as the
  // heading source (see useHeading).
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { heading, needsCompassPermission, requestCompass } = useHeading(gpsHeading, moving);

  useEffect(() => {
    if (!enabled) return;
    let watch: GeoWatch | null = null;
    let cancelled = false;
    watchPosition(
      (p) => {
        setPos([p.lat, p.lon]);
        if (p.heading != null) setGpsHeading(p.heading);
        // Speed is the primary movement signal; where a device omits it, browsers
        // null out `heading` when near-stationary, so heading-presence is the backup.
        setMoving(p.speed != null ? p.speed >= MOVE_MIN_SPEED : p.heading != null);
      },
      (msg) => setError(msg),
    ).then((w) => {
      // Effect may have torn down before the async watch resolved.
      if (cancelled) w.clear();
      else watch = w;
    });
    return () => {
      cancelled = true;
      watch?.clear();
    };
  }, [enabled]);

  return { pos, heading, needsCompassPermission, requestCompass, error };
}
