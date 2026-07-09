import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRun, type RunStop } from "@rosm/core/stores/run";
import { useOutbox } from "@rosm/core/stores/outbox";
import { runGuidance, ARRIVAL_RADIUS_M, PROXIMITY_RADIUS_M } from "@rosm/core/guidance";
import { compass, type Pt } from "@rosm/core/geo";
import { ptLabel } from "@rosm/core/pointTypes";
import { editSummary, todayLocal } from "@rosm/core/editSummary";
import { STATUS_COLOR } from "@rosm/core/editStatus";
import { archiveRoute, getArchivedRoutes } from "@rosm/core/routeArchive";
import type { EditAction, EditExtras } from "@rosm/core/schemas";
import { api } from "../ports/api";
import { watchRunPosition } from "../ports/geolocation";
import type { GeoWatch } from "@rosm/core/ports";
import { hapticSuccess } from "../ports/haptics";
import { keepAwake, allowSleep } from "../ports/keepAwake";
import { celebratePoint } from "../ports/confetti";
import { ensureNotifyPermission, notifyProximity, notifyRunComplete } from "../ports/notify";
import type { RosmMarker } from "../map/RosmMap";

// The Expo run session: live GPS, the shared guidance derived from it, the OSM
// recording actions, and marker DATA for RosmMap. Mirrors the web useRunSession
// but returns markers as plain data (the screen owns the bottom sheet).
export function useRunSession({ enabled = true }: { enabled?: boolean } = {}) {
  const run = useRun();
  const [pos, setPos] = useState<Pt | null>(null);
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const [manualArrived, setManualArrived] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(() => enabled && !useRun.getState().hasPlan);
  const [lastSaved, setLastSaved] = useState<{ nodeId: number; summary: string } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [closed, setClosed] = useState<{ changesetUrl?: string } | null>(null);

  // Cold start (direct nav to /run): recover the most recent archived run.
  useEffect(() => {
    if (!enabled || useRun.getState().hasPlan) return;
    Promise.resolve().then(() => {
      const latest = getArchivedRoutes()[0];
      if (latest?.plan?.stops?.length) useRun.getState().hydrate(latest.plan);
      setHydrating(false);
    });
  }, [enabled]);

  // Live position (background task via the geolocation port).
  useEffect(() => {
    if (!enabled) return;
    let watch: GeoWatch | null = null;
    let cancelled = false;
    watchRunPosition(
      (p) => {
        setPos({ lat: p.lat, lon: p.lon });
        if (p.heading != null) setGpsHeading(p.heading);
      },
      (msg) => setErr(msg),
    ).then((w) => {
      if (cancelled) w.clear();
      else watch = w;
    });
    return () => {
      cancelled = true;
      watch?.clear();
    };
  }, [enabled]);

  // Keep the screen awake + ask for notification permission while armed.
  useEffect(() => {
    if (!enabled) return;
    keepAwake();
    ensureNotifyPermission();
    return () => allowSleep();
  }, [enabled]);

  const { stops, index, tagKey, tagValue, added, pool } = run;
  const addLabel = ptLabel(tagKey, tagValue);
  const target: RunStop | undefined = stops[index];
  const done = run.hasPlan && index >= stops.length;

  const { distToTarget, bearingTo, nextTurn, distToTurn, autoArrived } = runGuidance(
    pos,
    target ?? null,
    run.routeCoords,
    run.turns,
  );
  const heading = target ? compass(bearingTo) : "";
  const arrived = manualArrived || autoArrived;

  // Proximity alert, once per target within the proximity band.
  const notifiedProxRef = useRef<number>(-1);
  useEffect(() => {
    if (!enabled || !target || distToTarget == null) return;
    if (
      distToTarget < PROXIMITY_RADIUS_M &&
      distToTarget >= ARRIVAL_RADIUS_M &&
      notifiedProxRef.current !== index
    ) {
      notifiedProxRef.current = index;
      notifyProximity(target.tags?.name || `node ${target.id}`, distToTarget);
    }
  }, [enabled, target, distToTarget, index]);

  const notifiedDoneRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (done && !notifiedDoneRef.current) {
      notifiedDoneRef.current = true;
      const surveyed = stops.filter((s) => s.status !== "pending" && s.status !== "skipped").length;
      notifyRunComplete(surveyed);
    }
    if (!done) notifiedDoneRef.current = false;
  }, [enabled, done, stops]);

  const persist = useCallback(
    (nextIndex: number, changesetId?: number) => {
      const routeId = useRun.getState().routeId;
      const plan = {
        start: run.start,
        loop: run.loop,
        tagKey,
        tagValue,
        stops: useRun.getState().stops,
        vias: run.vias,
        pool: run.pool,
        added: useRun.getState().added,
        routeCoords: run.routeCoords,
        distanceM: run.distanceM,
        turns: run.turns,
        index: nextIndex,
        changesetId: changesetId ?? run.changesetId,
      };
      archiveRoute({ routeId, plan, edits: useOutbox.getState().items });
    },
    [run, tagKey, tagValue],
  );

  const advance = useCallback(() => {
    const ni = index + 1;
    run.setIndex(ni);
    setManualArrived(false);
    persist(ni);
  }, [index, run, persist]);

  const recordFor = useCallback(
    (node: RunStop, action: EditAction, extras?: EditExtras) => {
      const isCurrent = !!target && node.id === target.id;
      setErr(null);
      useOutbox
        .getState()
        .enqueue({ nodeId: node.id, action, tagKey, name: node.tags?.name, extras });
      run.setStatus(node.id, action as RunStop["status"]);
      celebratePoint();
      hapticSuccess();
      setLastSaved({ nodeId: node.id, summary: editSummary(action, tagKey, todayLocal(), extras) });
      if (isCurrent) {
        persist(index + 1);
        advance();
      } else {
        persist(index);
      }
      useOutbox.getState().flush();
    },
    [target, tagKey, run, index, persist, advance],
  );

  const record = useCallback(
    (action: EditAction) => {
      if (target) recordFor(target, action);
    },
    [target, recordFor],
  );

  const skip = useCallback(() => {
    setLastSaved(null);
    if (target) run.setStatus(target.id, "skipped");
    advance();
  }, [target, run, advance]);

  const finish = useCallback(async () => {
    setFinishing(true);
    try {
      const changesetId = useOutbox.getState().changesetId;
      if (changesetId) {
        const r = await api.apiFetch("/api/osm/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changesetId }),
        });
        const j = await r.json();
        const alreadyClosed = typeof j.error === "string" && /was closed/i.test(j.error);
        if ((!r.ok || j.ok === false) && !alreadyClosed) throw new Error(j.error || "close failed");
        useOutbox.getState().setChangeset(undefined);
        setClosed({ changesetUrl: j.changesetUrl });
      } else {
        setClosed({});
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setFinishing(false);
    }
  }, []);

  const reset = useCallback(() => {
    run.reset();
    useOutbox.getState().clear();
  }, [run]);

  const line: [number, number][] = useMemo(
    () => run.routeCoords.map(([lon, lat]) => [lat, lon]),
    [run.routeCoords],
  );

  const markers: RosmMarker[] = useMemo(() => {
    const onRoute = new Set(stops.map((s) => s.id));
    const stopMarkers: RosmMarker[] = stops.map((s, i) => ({
      id: s.id,
      lat: s.lat,
      lon: s.lon,
      color: i === index && s.status === "pending" ? "#2563eb" : STATUS_COLOR[s.status],
      label: String(i + 1),
    }));
    const addedMarkers: RosmMarker[] = added.map((f) => ({
      id: f.id,
      lat: f.lat,
      lon: f.lon,
      color: "#16a34a",
      label: "+",
    }));
    const dimMarkers: RosmMarker[] = pool
      .filter((f) => !onRoute.has(f.id))
      .map((f) => ({ id: f.id, lat: f.lat, lon: f.lon, color: "#9ca3af", dimmed: true }));
    return [...dimMarkers, ...stopMarkers, ...addedMarkers];
  }, [stops, index, added, pool]);

  const center: [number, number] = pos
    ? [pos.lat, pos.lon]
    : target
      ? [target.lat, target.lon]
      : [run.start.lat, run.start.lon];

  const fitPoints: [number, number][] | undefined =
    pos && target
      ? [
          [pos.lat, pos.lon],
          [target.lat, target.lon],
        ]
      : undefined;

  const recenterKey =
    (pos ? `${pos.lat.toFixed(4)},${pos.lon.toFixed(4)}` : "t") +
    (target ? `|${target.lat.toFixed(4)},${target.lon.toFixed(4)}` : "");

  return {
    markers,
    line,
    center,
    userPos: pos ? ([pos.lat, pos.lon] as [number, number]) : null,
    userHeading: gpsHeading,
    recenterKey,
    fitPoints,
    hydrating,
    done,
    stops,
    index,
    target,
    distToTarget,
    heading,
    nextTurn,
    distToTurn,
    arrived,
    addLabel,
    err,
    lastSaved,
    finishing,
    closed,
    setManualArrived,
    recordFor,
    record,
    skip,
    finish,
    reset,
  };
}

export type RunSession = ReturnType<typeof useRunSession>;
