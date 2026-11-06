import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import type { GeoPoint, GeoWatch } from "@water-run/core/ports";
import { getActiveRunId, trackingAction } from "@water-run/core/runLifecycle";
import { emitPoint, listenerCount, onPoint } from "../ports/locationEmitter";

// Live run tracking: the background location task, and when it may run.
//
// A started task outlives the process: expo-task-manager persists it and
// restores it at the next launch (EXTaskService _restoreTasks on iOS,
// TaskService.restoreTasks on Android), and on iOS that resumes GPS at once.
// So stopping only when the run screen unmounts isn't enough: after a crash or
// a kill mid-run, the next launches would track at full accuracy with nothing
// listening. The task therefore runs only while both hold: a run is active
// (core's runLifecycle keeps its id in kv until the run ends) and a run screen
// is listening for fixes. reconcileRunTracking brings the task in line with
// that. Every start and stop goes through it, one at a time, each reading the
// facts on its own turn, so a quick unmount and remount can't stop the task
// the new screen relies on.
export const RUN_LOCATION_TASK = "water-run-location";

// Registered at module scope (imported from app/_layout) so it exists at launch,
// including cold background deliveries. The body touches no React — it pushes
// each location into the shared emitter.
TaskManager.defineTask(RUN_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  // Fixes nobody will use: the task outlived its run or its screen (restored
  // after the app died mid-run). Stop it rather than track for nobody.
  if (getActiveRunId() === null || listenerCount() === 0) {
    void reconcileRunTracking();
    return;
  }
  const { locations } = data as { locations: Location.LocationObject[] };
  for (const loc of locations) {
    const h = loc.coords.heading;
    emitPoint({
      lat: loc.coords.latitude,
      lon: loc.coords.longitude,
      // heading is course-over-ground: -1 / null when stationary.
      heading: h != null && Number.isFinite(h) && h >= 0 ? h : null,
      accuracy: loc.coords.accuracy ?? undefined,
    });
  }
});

let turn: Promise<void> = Promise.resolve();

// Why a start failed. `denied` marks the one the user can fix only in
// Settings, so the screen can offer to open them.
export type TrackingError = { message: string; denied?: boolean };
type OnError = (e: TrackingError) => void;

export const LOCATION_DENIED_MESSAGE = "Turn on location for Water Run to guide your run.";

// Start or stop the task to match the facts above, after any start or stop
// already under way. `onError` hears why a start failed.
export function reconcileRunTracking(onError?: OnError): Promise<void> {
  const next = turn.then(() => reconcile(onError));
  turn = next.catch(() => {});
  return next;
}

async function reconcile(onError?: OnError): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(RUN_LOCATION_TASK).catch(
    () => null,
  );
  const action = trackingAction({
    activeRun: getActiveRunId() !== null,
    listening: listenerCount() > 0,
    started,
  });
  if (action === "stop") {
    // Rejects when the task isn't registered, i.e. already stopped.
    await Location.stopLocationUpdatesAsync(RUN_LOCATION_TASK).catch(() => {});
  } else if (action === "start") {
    await start(onError);
  }
}

async function start(onError?: OnError): Promise<void> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) {
      onError?.({ message: LOCATION_DENIED_MESSAGE, denied: !fg.canAskAgain });
      return;
    }
    // iOS: When In Use is enough, so the run never asks for Always. Updates
    // started in the foreground with the location background mode keep coming
    // with the screen locked, under the system's blue location indicator
    // (Core Location: "an app with When in Use authorization continues to run
    // in the background when location services are active"), and
    // expo-location's iOS startLocationUpdatesAsync checks only the foreground
    // grant. Apple prefers When In Use, and Always can be asked for only once.
    // Android keeps asking: its background grant is a separate, best-effort
    // request there.
    if (Platform.OS === "android") {
      await Location.requestBackgroundPermissionsAsync().catch(() => {});
    }
    await Location.startLocationUpdatesAsync(RUN_LOCATION_TASK, {
      // Highest, not BestForNavigation: expo-location maps that to iOS's
      // kCLLocationAccuracyBestForNavigation, which Apple means for a device
      // on power, and to a 500 ms fused interval on Android. Highest is
      // kCLLocationAccuracyBest and 1 s; distanceInterval replaces its 25 m
      // Android default.
      accuracy: Location.Accuracy.Highest,
      distanceInterval: 5,
      activityType: Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Tracking your run",
        notificationBody: "Water Run is recording your route and the points you survey.",
      },
    });
  } catch (e) {
    onError?.({ message: (e as Error).message });
  }
}

// Stream the active run's fixes to `onP`, starting the task if it isn't
// running. The listener is in place before the task can start, so its first
// fix has somewhere to go. clear() stops listening, and the task stops with
// the last listener; ending the run stops it even while the screen is up.
// `settled` resolves once the start (and any permission prompt it raised) is
// over, so a screen can hold its own prompts until then.
export function trackRun(
  onP: (p: GeoPoint) => void,
  onError: OnError,
): GeoWatch & { settled: Promise<void> } {
  const off = onPoint(onP);
  const settled = reconcileRunTracking(onError).catch(() => {});
  return {
    settled,
    clear: () => {
      off();
      void reconcileRunTracking();
    },
  };
}
