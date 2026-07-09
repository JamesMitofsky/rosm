"use client";

// Geolocation through Capacitor — one API surface for both targets. The Geolocation
// plugin's web implementation wraps navigator.geolocation, so the same calls power
// the PWA and the native app (CoreLocation, with iOS permission from the Info.plist
// usage strings). Background tracking (watchRunPosition) is the one native-only path;
// it falls back to the foreground watch on the web.

import { registerPlugin } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { isNative } from "@/lib/api";

export type GeoPoint = {
  lat: number;
  lon: number;
  heading: number | null; // travel direction in degrees, present only while moving
  accuracy?: number;
};

export type GeoWatch = { clear: () => void };

type Opts = { highAccuracy?: boolean; maximumAge?: number };

type Coords = {
  latitude: number;
  longitude: number;
  heading?: number | null;
  accuracy?: number | null;
};

function toPoint(c: Coords): GeoPoint {
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
  const id = await Geolocation.watchPosition({ enableHighAccuracy, maximumAge }, (pos, err) => {
    if (err) return onError(err.message ?? String(err));
    if (pos) onPoint(toPoint(pos.coords));
  });
  return { clear: () => void Geolocation.clearWatch({ id }) };
}

// Watch position for the duration of an active run. On native this uses the
// background-geolocation plugin so tracking continues with the screen off / app
// backgrounded (iOS shows the location indicator + a foreground-service notice).
// On web it's the same foreground watch as watchPosition. Callers feed the points
// into the run's arrival/distance/archive pipeline exactly as before.
export async function watchRunPosition(
  onPoint: (p: GeoPoint) => void,
  onError: (msg: string) => void,
): Promise<GeoWatch> {
  if (isNative()) {
    const BackgroundGeolocation =
      registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
    const id = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: "Tracking your run",
        backgroundMessage: "ROSM is recording your route and the points you survey.",
        requestPermissions: true,
        stale: false,
        distanceFilter: 5,
      },
      (location, error) => {
        if (error) return onError(error.message ?? String(error));
        if (location)
          onPoint({
            lat: location.latitude,
            lon: location.longitude,
            // bearing is the course over ground (heading) — present only while moving.
            heading:
              location.bearing != null && Number.isFinite(location.bearing)
                ? location.bearing
                : null,
            accuracy: location.accuracy ?? undefined,
          });
      },
    );
    return { clear: () => void BackgroundGeolocation.removeWatcher({ id }) };
  }

  return watchPosition(onPoint, onError, { highAccuracy: true, maximumAge: 5000 });
}

// One-shot current position (planner "use my location").
export async function getCurrentPosition(opts: Opts = {}): Promise<GeoPoint> {
  const enableHighAccuracy = opts.highAccuracy ?? true;
  const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy });
  return toPoint(pos.coords);
}
