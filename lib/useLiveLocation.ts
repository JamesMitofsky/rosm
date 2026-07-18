"use client";

import { useEffect, useState } from "react";
import { watchPosition, type GeoWatch } from "@/lib/geolocation";
import { useHeading } from "@/lib/useHeading";

// The live blue dot + heading cone for any map that shows the user — the same
// treatment the run screen gets, minus the background tracking that only an
// armed run needs. A foreground GPS watch keeps the dot on the user as they move.
// The device compass orients the cone (`heading`); the GPS travel course
// (`mapBearing`) orients the heading-up map.
//
// `enabled` gates the GPS watch so a map can defer it until the user opts into
// location (e.g. after a consent gate). The compass listener is harmless and
// always attached; `needsCompassPermission`/`requestCompass` drive the same
// CompassEnableModal the run uses on iOS.
export function useLiveLocation({ enabled = true }: { enabled?: boolean } = {}) {
  const [pos, setPos] = useState<[number, number] | null>(null);
  // GPS travel direction (course over ground) — orients the heading-up map.
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { heading, needsCompassPermission, requestCompass } = useHeading();

  useEffect(() => {
    if (!enabled) return;
    let watch: GeoWatch | null = null;
    let cancelled = false;
    watchPosition(
      (p) => {
        setPos([p.lat, p.lon]);
        if (p.heading != null) setGpsHeading(p.heading);
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

  // `heading` (compass) orients the cone; `mapBearing` (travel course) orients
  // the heading-up map, matching the run screen.
  return { pos, heading, mapBearing: gpsHeading, needsCompassPermission, requestCompass, error };
}
