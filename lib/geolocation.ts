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

// Why a fix couldn't be acquired, so callers can tell the user what actually
// went wrong instead of blaming permissions for every failure:
//   denied      — permission refused (browser site setting or OS location toggle)
//   unavailable — device couldn't produce a position (e.g. Wi-Fi-only iPads, no GPS)
//   timeout     — no fix within the time limit
//   insecure    — page served over plain HTTP; browsers hide geolocation entirely
export type GeoErrorReason = "denied" | "unavailable" | "timeout" | "insecure" | "unknown";

export class GeoError extends Error {
  constructor(
    public readonly reason: GeoErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "GeoError";
  }
}

// Web rejections carry GeolocationPositionError codes; native (CoreLocation via
// Capacitor) rejects with message strings only, hence the keyword fallback.
function toGeoError(err: unknown): GeoError {
  if (err instanceof GeoError) return err;
  const code = (err as { code?: unknown } | null)?.code;
  const message = err instanceof Error ? err.message : String(err);
  if (code === 1 || /denied|permission/i.test(message)) return new GeoError("denied", message);
  if (code === 2 || /unavailable|unknown location/i.test(message))
    return new GeoError("unavailable", message);
  if (code === 3 || /timeout|timed out/i.test(message)) return new GeoError("timeout", message);
  return new GeoError("unknown", message);
}

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
        backgroundMessage: "Fountain Mapper is recording your route and the points you survey.",
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

// True when location access is already granted, so callers can skip re-asking.
// On the web this resolves navigator.permissions; on native it reads CoreLocation's
// current authorization. "prompt"/"denied" both return false — we only skip the
// consent gate when the fix is guaranteed available without a new system prompt.
export async function hasLocationPermission(): Promise<boolean> {
  try {
    const status = await Geolocation.checkPermissions();
    return status.location === "granted" || status.coarseLocation === "granted";
  } catch {
    return false;
  }
}

// Bounded acquisition: fail within 10s instead of hanging on a device that
// can't get a fix, and accept a fix up to a minute old — plenty fresh for
// anchoring a search, and it lets GPS-less devices reuse a cached position.
const FIX_OPTS = { timeout: 10_000, maximumAge: 60_000 } as const;

// One-shot current position (planner "use my location"). Throws GeoError so
// callers can branch on why acquisition failed.
export async function getCurrentPosition(opts: Opts = {}): Promise<GeoPoint> {
  const enableHighAccuracy = opts.highAccuracy ?? true;
  if (!isNative() && typeof window !== "undefined" && !window.isSecureContext) {
    throw new GeoError("insecure", "Geolocation requires a secure (HTTPS) context.");
  }
  try {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy, ...FIX_OPTS });
    return toPoint(pos.coords);
  } catch (err) {
    const first = toGeoError(err);
    // A denied permission won't improve on retry — but unavailable/timeout often
    // do when we drop to coarse accuracy: Wi-Fi-only iPads have no GPS and can
    // fail a high-accuracy request while a network-derived fix succeeds.
    if (first.reason === "denied" || !enableHighAccuracy) throw first;
    const retry = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      ...FIX_OPTS,
    }).catch(() => {
      throw first;
    });
    return toPoint(retry.coords);
  }
}
