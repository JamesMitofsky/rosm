import * as TaskManager from "expo-task-manager";
import type { LocationObject } from "expo-location";
import { emitPoint } from "../ports/locationEmitter";

// Registered at module scope (imported from app/_layout) so it exists at launch,
// including cold background deliveries. The body touches no React — it pushes each
// location into the shared emitter.
export const RUN_LOCATION_TASK = "rosm-run-location";

TaskManager.defineTask(RUN_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: LocationObject[] };
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
