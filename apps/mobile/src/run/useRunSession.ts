import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useRun, type RunStop, type StopStatus } from "@water-run/core/stores/run";
import { isUndoable, useOutbox } from "@water-run/core/stores/outbox";
import {
  runGuidance,
  guidanceWindow,
  ARRIVAL_RADIUS_M,
  PROXIMITY_RADIUS_M,
} from "@water-run/core/guidance";
import { compass, type Pt } from "@water-run/core/geo";
import { runCue } from "@water-run/core/runCue";
import { ptLabel } from "@water-run/core/pointTypes";
import { STATUS_COLOR } from "@water-run/core/editStatus";
import { activeRunToResume, archiveRun, beginRun } from "@water-run/core/runLifecycle";
import { progressLine } from "@water-run/core/runProgress";
import type { EditAction, EditExtras, Fountain } from "@water-run/core/schemas";
import type { SurveyAction } from "../components/PointSheet";
import { getToken } from "../auth/authStore";
import { useOsmStatus } from "../auth/useOsmStatus";
import { trackRun, type TrackingError } from "../tasks/runLocationTask";
import { createFountain } from "./createFountain";
import { hapticImpact, hapticSelect, hapticSuccess } from "../ports/haptics";
import { announce } from "../ports/accessibility";
import { keepAwake, allowSleep } from "../ports/keepAwake";
import { celebratePoint } from "../ports/confetti";
import {
  ensureNotifyPermission,
  notifyProximity,
  notifyRunComplete,
  showRunProgress,
  endRunProgress,
} from "../ports/notify";
import type { MapMarker } from "../map/WaterRunMap";

// Human-facing confirmation shown after a save. No raw OSM tags reach the UI.
const SAVED_LABEL: Record<SurveyAction, string> = {
  confirm: "Working",
  broken: "Partially working",
  out_of_order: "Out of order",
  removed: "Removed",
};

// The last stop recorded, for the panel's "Saved" line and its Undo: what to
// cancel in the outbox, and what to put the run back to.
type LastSaved = {
  nodeId: number;
  label: string;
  // Absent for a point added on the spot: a create goes straight to OSM, so
  // there is nothing on the device to take back.
  undo?: {
    itemId: string;
    holdUntil: number;
    index: number; // where the run stood before the record
    status: StopStatus | undefined; // the stop's status before it
  };
};

// The Expo run session: live GPS, the shared guidance derived from it, the OSM
// recording actions, and marker DATA for WaterRunMap. Mirrors the web useRunSession
// but returns markers as plain data (the screen owns the bottom sheet). Ending
// the run is run/runLifecycle's endRun, not part of the session.
export function useRunSession({
  enabled = true,
  onArrive,
}: {
  enabled?: boolean;
  // The runner just came within the arrival radius of the stop they're
  // heading for. Called once per stop, while the app is in the foreground.
  onArrive?: (stop: RunStop) => void;
} = {}) {
  const run = useRun();
  const { status: osm } = useOsmStatus();
  const [pos, setPos] = useState<Pt | null>(null);
  const [manualArrived, setManualArrived] = useState(false);
  const [err, setErrState] = useState<string | null>(null);
  // Whether the error is a location denial only Settings can undo.
  const [locationDenied, setLocationDenied] = useState(false);
  // Errors appear over the map, so VoiceOver is told as well.
  const setErr = useCallback((message: string | null) => {
    setErrState(message);
    if (message) announce(message);
  }, []);
  const [hydrating, setHydrating] = useState(() => enabled && !useRun.getState().hasPlan);
  const [nothingToResume, setNothingToResume] = useState(false);
  const [lastSaved, setLastSaved] = useState<LastSaved | null>(null);

  // Cold start (/run reached with no run in memory, e.g. by a link): pick the
  // active run back up by its id and under that id, so its archive entry keeps
  // being the one updated. A finished run, or none, is nothing to resume.
  useEffect(() => {
    if (!enabled || useRun.getState().hasPlan) return;
    Promise.resolve().then(() => {
      const saved = activeRunToResume();
      if (saved) useRun.getState().hydrate(saved);
      else setNothingToResume(true);
      setHydrating(false);
    });
  }, [enabled]);

  // Mark the run active, then follow it: the background location task, which
  // runs only while a run is active and a screen listens (see
  // tasks/runLocationTask).
  const { hasPlan, routeId } = run;
  useEffect(() => {
    if (!enabled || !hasPlan) return;
    beginRun();
    let live = true;
    const watch = trackRun(
      (p) => {
        setPos({ lat: p.lat, lon: p.lon });
        setLocationDenied(false);
      },
      (e: TrackingError) => {
        setErr(e.message);
        setLocationDenied(!!e.denied);
      },
    );
    // The lock-screen updates need notifications, asked for only once the
    // location prompt is over, so the two system prompts never stack.
    void watch.settled.then(() => {
      if (live) void ensureNotifyPermission();
    });
    return () => {
      live = false;
      watch.clear();
    };
  }, [enabled, hasPlan, routeId, setErr]);

  // Keep the screen awake while armed.
  useEffect(() => {
    if (!enabled) return;
    keepAwake();
    return () => allowSleep();
  }, [enabled]);

  const { stops, index, tagKey, tagValue, added, pool, routeCoords, turns } = run;
  const addLabel = ptLabel(tagKey, tagValue);
  const target: RunStop | undefined = stops[index];
  const done = hasPlan && index >= stops.length;

  // The stretch of route between the previous stop and this one, so the
  // guidance doesn't latch onto another pass of a route that doubles back.
  // Changes only with the stop, not with each fix.
  const stretch = useMemo(
    () => guidanceWindow(routeCoords, stops, index),
    [routeCoords, stops, index],
  );
  const { distToTarget, bearingTo, nextTurn, distToTurn, autoArrived } = runGuidance(
    pos,
    target ?? null,
    routeCoords,
    turns,
    stretch,
  );
  const heading = target ? compass(bearingTo) : "";
  const arrived = manualArrived || autoArrived;
  // What the panel leads with: distance, direction, and the next turn before
  // the stop (a turn past it belongs to the next leg).
  const cue = target
    ? runCue({
        distToTargetM: distToTarget,
        bearingTo,
        nextTurn,
        distToTurnM: distToTurn,
        stopAlongM: stretch?.[1],
      })
    : null;

  // Proximity cue, once per target within the proximity band: a haptic (felt
  // without looking) while the app is open, a notification while it isn't
  // (notifyProximity skips the foreground).
  const notifiedProxRef = useRef<number>(-1);
  useEffect(() => {
    if (!enabled || !target || distToTarget == null) return;
    if (
      distToTarget < PROXIMITY_RADIUS_M &&
      distToTarget >= ARRIVAL_RADIUS_M &&
      notifiedProxRef.current !== index
    ) {
      notifiedProxRef.current = index;
      const name = target.tags?.name || `Stop ${index + 1}`;
      if (AppState.currentState === "active") {
        hapticImpact();
        announce(`${name} is close.`);
      } else {
        notifyProximity(name, distToTarget);
      }
    }
  }, [enabled, target, distToTarget, index]);

  // Arrival, once per stop: the runner is there, so the screen can put the
  // survey in front of them without a tap.
  const onArriveRef = useRef(onArrive);
  useEffect(() => {
    onArriveRef.current = onArrive;
  });
  const arrivedForRef = useRef<number>(-1);
  useEffect(() => {
    if (!enabled || !target || !autoArrived || arrivedForRef.current === index) return;
    arrivedForRef.current = index;
    if (target.status !== "pending" || AppState.currentState !== "active") return;
    hapticSuccess();
    announce(`Arrived at ${target.tags?.name || `stop ${index + 1}`}.`);
    onArriveRef.current?.(target);
  }, [enabled, target, autoArrived, index]);

  // The lock-screen progress line. Handed every fix; the notifier decides
  // whether it's worth a post. Taken down once every stop is done, and when the
  // run leaves the screen.
  useEffect(() => {
    if (!enabled) return;
    if (!target) {
      endRunProgress();
      return;
    }
    if (distToTarget == null) return;
    showRunProgress(
      progressLine({
        stopKey: `${index}:${target.id}`,
        stopName: target.tags?.name || `Stop #${index + 1}`,
        distToStopM: distToTarget,
        nextTurn,
        distToTurnM: distToTurn,
      }),
    );
  }, [enabled, target, distToTarget, index, nextTurn, distToTurn]);
  useEffect(() => {
    if (!enabled) return;
    return () => endRunProgress();
  }, [enabled]);

  const notifiedDoneRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (done && !notifiedDoneRef.current) {
      notifiedDoneRef.current = true;
      const surveyed = stops.filter((s) => s.status !== "pending" && s.status !== "skipped").length;
      notifyRunComplete(surveyed);
      // The run's one celebration: per-stop records get a haptic and the
      // panel's Saved line, not motion on every stop (HIG: Motion).
      if (surveyed > 0) celebratePoint();
      announce(`Route complete. ${surveyed} of ${stops.length} points surveyed.`);
    }
    if (!done) notifiedDoneRef.current = false;
  }, [enabled, done, stops]);

  const advance = useCallback(() => {
    const ni = index + 1;
    run.setIndex(ni);
    setManualArrived(false);
    archiveRun(ni);
  }, [index, run]);

  const recordFor = useCallback(
    (node: Fountain, action: SurveyAction, extras?: EditExtras) => {
      const isCurrent = !!target && node.id === target.id;
      setErr(null);
      const before = stops.find((st) => st.id === node.id)?.status;
      const item = useOutbox
        .getState()
        .enqueue({ nodeId: node.id, action, tagKey, name: node.tags?.name, extras });
      run.setStatus(node.id, action as RunStop["status"]);
      hapticSuccess();
      announce(`Saved: ${SAVED_LABEL[action]}.`);
      setLastSaved({
        nodeId: node.id,
        label: SAVED_LABEL[action],
        undo: item.holdUntil
          ? { itemId: item.id, holdUntil: Date.parse(item.holdUntil), index, status: before }
          : undefined,
      });
      // advance() archives the run at the next stop; a node off the current
      // stop is archived where the run stands.
      if (isCurrent) advance();
      else archiveRun(index);
      useOutbox.getState().flush();
    },
    [target, tagKey, run, index, advance, stops, setErr],
  );

  // Undo is on offer while the last record is still inside the outbox's hold
  // (isUndoable); the panel's button goes when the hold ends.
  const [undoOpen, setUndoOpen] = useState(false);
  useEffect(() => {
    const u = lastSaved?.undo;
    const left = u ? u.holdUntil - Date.now() : 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows lastSaved; the timer closes it
    setUndoOpen(left > 0);
    if (left <= 0) return;
    const t = setTimeout(() => setUndoOpen(false), left);
    return () => clearTimeout(t);
  }, [lastSaved]);

  // Take the last record back: the edit never leaves the device, and the run
  // returns to that stop as it was.
  const undoLast = useCallback(() => {
    const u = lastSaved?.undo;
    if (!u) return;
    const item = useOutbox.getState().items.find((i) => i.id === u.itemId);
    if (!item || !isUndoable(item, Date.now()) || !useOutbox.getState().cancel(u.itemId)) {
      setUndoOpen(false);
      announce("Too late to undo: the update is already on its way.");
      return;
    }
    if (u.status !== undefined) run.setStatus(lastSaved!.nodeId, u.status);
    run.setIndex(u.index);
    setManualArrived(false);
    archiveRun(u.index);
    setLastSaved(null);
    hapticSelect();
    announce("Undone.");
  }, [lastSaved, run]);

  const record = useCallback(
    (action: EditAction, extras?: EditExtras) => {
      if (target) recordFor(target, action, extras);
    },
    [target, recordFor],
  );

  const skip = useCallback(() => {
    setLastSaved(null);
    if (target) run.setStatus(target.id, "skipped");
    advance();
  }, [target, run, advance]);

  // Step back to the previous stop and re-open it for action. Resets that stop's
  // status to pending so the arrival actions show again (a re-record just
  // enqueues a fresh OSM edit — last write wins). No-op at the first stop.
  const goBack = useCallback(() => {
    if (index <= 0) return;
    const pi = index - 1;
    setLastSaved(null);
    setManualArrived(false);
    run.setStatus(stops[pi].id, "pending");
    run.setIndex(pi);
    archiveRun(pi);
  }, [index, stops, run]);

  // Create a brand-new node of the surveyed type at a given spot (GPS position
  // or tapped map location). Rejects with a message fit for the user, so the
  // add sheet can keep what was entered for another try. Sent straight away,
  // not queued like an edit: a create resent after a reply that was lost would
  // add the point twice.
  const addAt = useCallback(
    async (at: { lat: number; lon: number }, extras?: EditExtras): Promise<void> => {
      // The token is the sign-in: the status endpoint can't tell signed out
      // from offline.
      if (!getToken()) throw new Error("Sign in first.");
      setErr(null);
      setLastSaved(null);
      const { changesetId, ...node } = await createFountain(
        at,
        { key: tagKey, value: tagValue },
        extras,
      );
      run.setChangeset(changesetId);
      run.addNode(node);
      celebratePoint();
      hapticSuccess();
      setLastSaved({ nodeId: node.id, label: "Added" });
      announce("Fountain added.");
      archiveRun(index);
    },
    [tagKey, tagValue, run, index, setErr],
  );

  const addHere = useCallback(async () => {
    if (!pos) {
      setErr("Waiting for GPS fix.");
      return;
    }
    await addAt(pos).catch((e: Error) => setErr(e.message));
  }, [pos, addAt, setErr]);

  // The panel's error line, for a failure whose own UI has gone: an add whose
  // sheet was swiped away while it saved.
  const reportError = useCallback((message: string) => setErr(message), [setErr]);

  const endEarly = useCallback(() => {
    setLastSaved(null);
    setManualArrived(false);
    run.setIndex(stops.length);
    archiveRun(stops.length);
  }, [stops.length, run]);

  const line: [number, number][] = useMemo(
    () => routeCoords.map(([lon, lat]) => [lat, lon]),
    [routeCoords],
  );

  const markers: MapMarker[] = useMemo(() => {
    const onRoute = new Set(stops.map((s) => s.id));
    const stopMarkers: MapMarker[] = stops.map((s, i) => ({
      id: s.id,
      lat: s.lat,
      lon: s.lon,
      color: i === index && s.status === "pending" ? "#2563eb" : STATUS_COLOR[s.status],
      label: String(i + 1),
    }));
    const addedMarkers: MapMarker[] = added.map((f) => ({
      id: f.id,
      lat: f.lat,
      lon: f.lon,
      color: "#16a34a",
      label: "+",
    }));
    const dimMarkers: MapMarker[] = pool
      .filter((f) => !onRoute.has(f.id))
      .map((f) => ({ id: f.id, lat: f.lat, lon: f.lon, color: "#9ca3af", dimmed: true }));
    return [...dimMarkers, ...stopMarkers, ...addedMarkers];
  }, [stops, index, added, pool]);

  // Where the map opens before there is a fix to frame.
  const center: [number, number] = pos
    ? [pos.lat, pos.lon]
    : target
      ? [target.lat, target.lon]
      : [run.start.lat, run.start.lon];

  // What the map keeps in view: the runner and the stop they're heading for,
  // or just the runner once every stop is done. The map refits as these move
  // (until the user takes the camera), so they change only with a fix or a
  // new stop.
  const fitPoints = useMemo((): [number, number][] | undefined => {
    if (!pos) return undefined;
    return target
      ? [
          [pos.lat, pos.lon],
          [target.lat, target.lon],
        ]
      : [[pos.lat, pos.lon]];
  }, [pos, target]);

  return {
    markers,
    line,
    center,
    fitPoints,
    // A fix has come in, so location is permitted and the map's own puck
    // (which follows the device by itself) can be shown.
    located: pos !== null,
    pos,
    cue,
    locationDenied,
    hydrating,
    nothingToResume,
    done,
    routeId,
    stops,
    index,
    target,
    distToTarget,
    heading,
    nextTurn,
    distToTurn,
    arrived,
    addLabel,
    added,
    pool,
    osm,
    err,
    lastSaved,
    undoOpen,
    undoLast,
    setManualArrived,
    recordFor,
    record,
    skip,
    goBack,
    endEarly,
    addHere,
    addAt,
    reportError,
  };
}

export type RunSession = ReturnType<typeof useRunSession>;
