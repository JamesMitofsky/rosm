"use client";

// Geolocation through the browser API. On the web an active run watches in the
// foreground; continuous background tracking is a native-app concern handled by
// the Expo app. GeoPoint/GeoWatch are the shared @rosm/core shapes, re-exported
// here so existing importers keep resolving.
import type { GeoPoint, GeoWatch } from "@rosm/core/ports";

export type { GeoPoint, GeoWatch };

type Opts = { highAccuracy?: boolean; maximumAge?: number };

function toPoint(c: GeolocationCoordinates): GeoPoint {
  const h = c.heading;
  return {
    lat: c.latitude,
    lon: c.longitude,
    heading: h != null && Number.isFinite(h) ? h : null,
    accuracy: c.accuracy ?? undefined,
  };
}

// Continuously watch position until the returned handle is cleared.
export async function watchPosition(
  onPoint: (p: GeoPoint) => void,
  onError: (msg: string) => void,
  opts: Opts = {},
): Promise<GeoWatch> {
  const enableHighAccuracy = opts.highAccuracy ?? true;
  const maximumAge = opts.maximumAge ?? 5000;
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError("Geolocation unavailable");
    return { clear: () => {} };
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => onPoint(toPoint(pos.coords)),
    (err) => onError(err.message),
    { enableHighAccuracy, maximumAge },
  );
  return { clear: () => navigator.geolocation.clearWatch(id) };
}

// Watch position for the duration of an active run — the same foreground watch as
// watchPosition on the web. Callers feed the points into the run's
// arrival/distance/archive pipeline.
export async function watchRunPosition(
  onPoint: (p: GeoPoint) => void,
  onError: (msg: string) => void,
): Promise<GeoWatch> {
  return watchPosition(onPoint, onError, { highAccuracy: true, maximumAge: 5000 });
}

// One-shot current position (planner "use my location").
export async function getCurrentPosition(opts: Opts = {}): Promise<GeoPoint> {
  const enableHighAccuracy = opts.highAccuracy ?? true;
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toPoint(pos.coords)),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy },
    );
  });
}
