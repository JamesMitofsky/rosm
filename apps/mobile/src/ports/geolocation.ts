import * as Location from "expo-location";
import type { GeoPoint, GeoWatch, GeolocationPort } from "@rosm/core/ports";
import { onPoint, listenerCount } from "./locationEmitter";
import { RUN_LOCATION_TASK } from "../tasks/runLocationTask";

function toPoint(c: Location.LocationObjectCoords): GeoPoint {
  const h = c.heading;
  return {
    lat: c.latitude,
    lon: c.longitude,
    heading: h != null && Number.isFinite(h) && h >= 0 ? h : null,
    accuracy: c.accuracy ?? undefined,
  };
}

// Core only needs the one-shot fix (planner "use my location").
export const geolocation: GeolocationPort = {
  getCurrentPosition: async () => {
    await Location.requestForegroundPermissionsAsync();
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return toPoint(pos.coords);
  },
};

// Live run tracking (foreground + background). Starts the TaskManager location task
// so the run keeps recording with the screen locked, and streams its points to the
// caller via the shared emitter. Not a core port — the run hook calls it directly.
export async function watchRunPosition(
  onP: (p: GeoPoint) => void,
  onError: (msg: string) => void,
): Promise<GeoWatch> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) {
      onError("Location permission is required to guide your run.");
      return { clear: () => {} };
    }
    // Best-effort: without "Always" the run still tracks foreground + while the
    // screen is on (kept awake), which is the v1 experience.
    await Location.requestBackgroundPermissionsAsync().catch(() => {});

    const already = await Location.hasStartedLocationUpdatesAsync(RUN_LOCATION_TASK).catch(
      () => false,
    );
    if (!already) {
      await Location.startLocationUpdatesAsync(RUN_LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 5,
        activityType: Location.ActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "Tracking your run",
          notificationBody: "ROSM is recording your route and the points you survey.",
        },
      });
    }
  } catch (e) {
    onError((e as Error).message);
  }

  const off = onPoint(onP);
  return {
    clear: () => {
      off();
      if (listenerCount() === 0) {
        Location.stopLocationUpdatesAsync(RUN_LOCATION_TASK).catch(() => {});
      }
    },
  };
}
