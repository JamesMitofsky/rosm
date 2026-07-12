"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRun, type RunStop, type StopStatus } from "@/store/run";
import { useOutbox } from "@/store/outbox";
import { useUndo } from "@/store/undo";
import { bearing, compass, haversine, nearestCumDistOnPath, type Pt } from "@/lib/geo";
import { ptLabel } from "@/lib/pointTypes";
import type { MapMarker } from "@/components/MapView";
import type { EditAction, EditExtras } from "@/lib/schemas";
import { editSummary, todayLocal } from "@/lib/editSummary";
import { useOsmStatus } from "@/components/OsmStatus";
import PointPopup from "@/components/PointPopup";
import { celebratePoint } from "@/lib/confetti";
import { useHeading } from "@/lib/useHeading";
import { archiveRoute, getArchivedRoutes } from "@/lib/routeArchive";
import { apiFetch, isNative } from "@/lib/api";
import { watchRunPosition, type GeoWatch } from "@/lib/geolocation";
import { hapticSuccess } from "@/lib/haptics";
import { keepAwake, allowSleep } from "@/lib/keepAwake";
import { ensureNotifyPermission, notifyProximity, notifyRunComplete } from "@/lib/notify";
import { startRunActivity, updateRunActivity, endRunActivity } from "@/lib/liveActivity";
import { STATUS_COLOR } from "@/lib/editStatus";
import { createElement } from "react";

// Everything the active-run UI needs, in one place: live GPS, the guidance
// derived from it, the OSM-recording actions, and the data the (shared) map is
// fed. Decoupled from any one page so the run can render either on its own route
// (/run, PWA shortcut + reload recovery) or inline in the planner without a view
// switch — both feed the SAME <MapView> from this hook.
//
// `enabled` gates the side effects (GPS watch + hydrate-from-server). The planner
// keeps the hook mounted across phases but only arms it once the run begins, so
// the location prompt doesn't fire while the user is still building a route.
export function useRunSession({ enabled = true }: { enabled?: boolean } = {}) {
  const run = useRun();
  const { status: osm, refresh } = useOsmStatus();

  const [pos, setPos] = useState<Pt | null>(null);
  // GPS travel direction (only while moving) — fallback for the compass heading.
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const { heading: deviceHeading, needsCompassPermission, requestCompass } = useHeading(gpsHeading);
  const [manualArrived, setManualArrived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Hydrate only matters when armed and the store is empty (direct nav to /run).
  const [hydrating, setHydrating] = useState(() => enabled && !useRun.getState().hasPlan);
  // Last per-tap write, recorded locally and shown until the next action. Sending
  // to OSM happens in the background — see the SyncStatus panel for delivery.
  const [lastSaved, setLastSaved] = useState<{ nodeId: number; summary: string } | null>(null);
  // Finish/close-changeset state (completion screen).
  const [finishing, setFinishing] = useState(false);
  const [finishErr, setFinishErr] = useState<string | null>(null);
  const [closed, setClosed] = useState<{ changesetUrl?: string } | null>(null);

  // Hydrate from saved run if store empty (reload / direct nav to /run). No-op
  // when already populated — the planner sets the plan in-place before arming the
  // hook, so it only fetches on a cold standalone mount (lazy `hydrating` init
  // above covers that first render; `finally` clears it).
  useEffect(() => {
    if (!enabled || useRun.getState().hasPlan) return;
    // Native has no server run state (the /api/run JSON file is web-only) — recover
    // the most recent run from the on-device route archive instead. Works offline.
    // Deferred off the effect body so the state update doesn't cascade-render.
    if (isNative()) {
      Promise.resolve().then(() => {
        const latest = getArchivedRoutes()[0];
        if (latest?.plan?.stops?.length) useRun.getState().hydrate(latest.plan);
        setHydrating(false);
      });
      return;
    }
    apiFetch("/api/run")
      .then((r) => r.json())
      .then((plan) => {
        if (plan && plan.stops?.length) useRun.getState().hydrate(plan);
      })
      .finally(() => setHydrating(false));
  }, [enabled]);

  // Live position — only while armed. Native uses background geolocation so the
  // run keeps tracking with the screen off / app backgrounded (see lib/geolocation);
  // web uses the browser API. Points feed the same arrival/distance/archive path.
  useEffect(() => {
    if (!enabled) return;
    let watch: GeoWatch | null = null;
    let cancelled = false;
    watchRunPosition(
      (p) => {
        setPos({ lat: p.lat, lon: p.lon });
        // GPS heading is the travel direction in degrees, present only while
        // moving. Used as fallback when the compass is denied/unsupported.
        if (p.heading != null) setGpsHeading(p.heading);
      },
      (msg) => setErr(`Location: ${msg}`),
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

  // Keep the screen awake for the duration of the armed run (native only).
  useEffect(() => {
    if (!enabled) return;
    keepAwake();
    return () => void allowSleep();
  }, [enabled]);

  // Ask for notification permission once, when the run is armed.
  useEffect(() => {
    if (enabled) ensureNotifyPermission();
  }, [enabled]);

  const { stops, index, loop, tagKey, tagValue, added, pool } = run;
  const addLabel = ptLabel(tagKey, tagValue);
  const target = stops[index];
  const done = run.hasPlan && index >= stops.length;

  const distToTarget = pos && target ? haversine(pos, target) : null;
  const bearingTo = pos && target ? bearing(pos, target) : 0;
  const heading = target ? compass(bearingTo) : "";

  // Next turn-by-turn maneuver: where we are along the route (meters traveled),
  // then the first precomputed turn still ahead of us. Travel-relative — the HUD
  // rotates an arrow by `angle` (0 = straight on), no compass needed.
  const traveledM =
    pos && run.routeCoords.length > 1 ? nearestCumDistOnPath(run.routeCoords, pos) : 0;
  const nextTurn = pos ? (run.turns.find((tn) => tn.distM > traveledM + 5) ?? null) : null;
  const distToTurn = nextTurn ? nextTurn.distM - traveledM : null;

  // Derived: armed manually ("I'm here") or auto within 30 m.
  const arrived = manualArrived || (distToTarget != null && distToTarget < 30);

  // Proximity alert for the current target — useful when the phone is pocketed or
  // the app is backgrounded. Fires once per target as you close within ~80 m
  // (auto-arrival at 30 m is handled by the on-screen UI). The ref stops it from
  // re-firing on every GPS tick.
  const notifiedProxRef = useRef<number>(-1);
  useEffect(() => {
    if (!enabled || !target || distToTarget == null) return;
    if (distToTarget < 80 && distToTarget >= 30 && notifiedProxRef.current !== index) {
      notifiedProxRef.current = index;
      notifyProximity(target.tags?.name || `node ${target.id}`, distToTarget);
    }
  }, [enabled, target, distToTarget, index]);

  // Notify once when the whole route is done (the changeset can be closed even from
  // the lock screen notification's app-open).
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

  // iOS Live Activity (lock screen / Dynamic Island). No-op until the native
  // RunActivity plugin + widget are added (see ios/LiveActivity/SETUP.md). Throttled
  // to target changes + 25 m distance buckets to stay within iOS update limits.
  const laStartedRef = useRef(false);
  const laKeyRef = useRef("");
  useEffect(() => {
    if (!enabled) return;
    if (done || !run.hasPlan || stops.length === 0) {
      if (laStartedRef.current) {
        endRunActivity();
        laStartedRef.current = false;
        laKeyRef.current = "";
      }
      return;
    }
    const state = {
      nextName: target?.tags?.name || (target ? `node ${target.id}` : "Run"),
      distanceToNext: distToTarget != null ? Math.round(distToTarget) : -1,
      stopsRemaining: Math.max(0, stops.length - index),
      totalStops: stops.length,
    };
    const key = `${index}:${distToTarget == null ? "x" : Math.round(distToTarget / 25)}`;
    if (!laStartedRef.current) {
      laStartedRef.current = true;
      laKeyRef.current = key;
      startRunActivity(state);
    } else if (key !== laKeyRef.current) {
      laKeyRef.current = key;
      updateRunActivity(state);
    }
  }, [enabled, done, run.hasPlan, stops.length, index, target, distToTarget]);

  // End the activity if the hook unmounts mid-run.
  useEffect(
    () => () => {
      if (laStartedRef.current) {
        endRunActivity();
        laStartedRef.current = false;
      }
    },
    [],
  );

  async function persist(nextIndex: number, changesetId?: number) {
    const routeId = useRun.getState().routeId;
    const plan = {
      start: run.start,
      loop,
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
    // Durable on-device record of this route + every node change, kept across N
    // routes. Written first so the archive survives even if the server POST fails.
    archiveRoute({ routeId, plan, edits: useOutbox.getState().items });
    // No-op on native (the archive above is the source of truth there).
    await apiFetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...plan, routeId }),
    });
  }

  function advance() {
    const ni = index + 1;
    run.setIndex(ni);
    setManualArrived(false);
    persist(ni);
  }

  // Record an OSM update for any node. Offline-first: written to the on-device
  // outbox and celebrated immediately, then sent to OSM in the background. Editing
  // the current target advances the run; editing another point on the fly (tapped
  // on the map) leaves the position. Every recording arms the 5s undo toast; undo
  // rolls back the stop status, the saved pill, and the auto-advance.
  function recordFor(node: RunStop, action: EditAction, extras?: EditExtras) {
    const isCurrent = !!target && node.id === target.id;
    const prevStatus = node.status;
    const prevIndex = index;
    setErr(null);
    const item = useOutbox
      .getState()
      .enqueue({ nodeId: node.id, action, tagKey, name: node.tags?.name, extras });
    run.setStatus(node.id, action as StopStatus);
    celebratePoint();
    hapticSuccess();
    setLastSaved({ nodeId: node.id, summary: editSummary(action, tagKey, todayLocal(), extras) });
    useUndo.getState().arm({
      kind: "edit",
      itemId: item.id,
      nodeId: node.id,
      summary: item.summary,
      onUndone: () => {
        useRun.getState().setStatus(node.id, prevStatus);
        setLastSaved(null);
        // Step back to the undone stop only if the run is still where this
        // recording left it — an undo shouldn't yank the runner off a stop
        // they've since moved to.
        if (isCurrent && useRun.getState().index === prevIndex + 1) {
          useRun.getState().setIndex(prevIndex);
          setManualArrived(false);
        }
        persist(useRun.getState().index);
      },
    });
    if (isCurrent) {
      persist(index + 1);
      advance();
    } else {
      persist(index);
    }
    useOutbox.getState().flush();
  }

  function record(action: EditAction, extras?: EditExtras) {
    if (target) recordFor(target, action, extras);
  }

  function skip() {
    setLastSaved(null);
    if (target) run.setStatus(target.id, "skipped");
    advance();
  }

  // Step back to the previous stop and re-open it for action. Resets that stop's
  // status to pending so the arrival actions show again (lets a mis-tap be redone;
  // a re-record just enqueues a fresh OSM edit — last write wins). Does not undo
  // edits already sent — the post-save undo toast (store/undo.ts) covers that,
  // within its window. No-op at the first stop.
  function goBack() {
    if (index <= 0) return;
    const pi = index - 1;
    setLastSaved(null);
    setManualArrived(false);
    run.setStatus(stops[pi].id, "pending");
    run.setIndex(pi);
    persist(pi);
  }

  // Create a brand-new node of the surveyed type at a given spot — the current
  // GPS position ("Add here") or a tapped map location. Extras carry the survey
  // facts (audience/seasonal/note) so the node is born fully described.
  // Online-only (needs a fresh node id back from OSM), but shares the outbox's
  // changeset so the create lands with the run's edits.
  async function addAt(at: Pt, extras?: EditExtras) {
    if (!osm?.loggedIn) {
      setErr("Sign in to OSM first.");
      return;
    }
    setAdding(true);
    setErr(null);
    setLastSaved(null);
    try {
      const r = await apiFetch("/api/osm/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: at.lat,
          lon: at.lon,
          tag: { key: tagKey, value: tagValue },
          changesetId: useOutbox.getState().changesetId,
          extras,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "create failed");
      useOutbox.getState().setChangeset(j.changesetId);
      run.addNode({ id: j.nodeId, lat: j.lat, lon: j.lon, tags: j.tags });
      celebratePoint();
      hapticSuccess();
      setLastSaved({ nodeId: j.nodeId, summary: j.summary });
      // The node already exists on OSM (creates are synchronous), so undo here
      // is a revert: delete the just-created node and drop it locally.
      useUndo.getState().arm({
        kind: "create",
        nodeId: j.nodeId,
        sentVersion: 1,
        summary: j.summary,
        onUndone: () => {
          useRun.getState().removeNode(j.nodeId);
          setLastSaved(null);
          persist(useRun.getState().index);
        },
      });
      await persist(index);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  // "Add here" convenience: create the node at the runner's own position.
  // Sign-in is checked before the fix so the actionable error wins while GPS
  // is still warming up.
  async function addHere() {
    if (!osm?.loggedIn) {
      setErr("Sign in to OSM first.");
      return;
    }
    if (!pos) {
      setErr("Waiting for GPS fix.");
      return;
    }
    await addAt(pos);
  }

  async function finish() {
    setFinishing(true);
    setFinishErr(null);
    try {
      const changesetId = useOutbox.getState().changesetId;
      if (changesetId) {
        const r = await apiFetch("/api/osm/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changesetId }),
        });
        const j = await r.json();
        // "was closed" = already closed (idle timeout / earlier finish) — the
        // desired end state, so treat it as success.
        const alreadyClosed = typeof j.error === "string" && /was closed/i.test(j.error);
        if ((!r.ok || j.ok === false) && !alreadyClosed) throw new Error(j.error || "close failed");
        // Drop the id so a later session can't rehydrate a closed changeset.
        useOutbox.getState().setChangeset(undefined);
        setClosed({ changesetUrl: j.changesetUrl });
      } else {
        setClosed({});
      }
    } catch (e) {
      setFinishErr((e as Error).message);
    } finally {
      setFinishing(false);
    }
  }

  // Tear down the run: clear the store + outbox so the next planner/run starts
  // clean. Navigation (if any) is the caller's concern.
  function reset() {
    run.reset();
    useOutbox.getState().clear();
  }

  const line: [number, number][] = useMemo(
    () => run.routeCoords.map(([lon, lat]) => [lat, lon]),
    [run.routeCoords],
  );

  const markers: MapMarker[] = useMemo(() => {
    const stopMarkers: MapMarker[] = stops.map((s, i) => ({
      id: s.id,
      lat: s.lat,
      lon: s.lon,
      color: i === index && s.status === "pending" ? "#2563eb" : STATUS_COLOR[s.status],
      label: String(i + 1),
      // Tap any point to update it in OSM on the fly, not just the current one.
      popup: createElement(PointPopup, {
        fountain: s,
        loggedIn: !!osm?.loggedIn,
        busy: false,
        onAction: (action: EditAction, extras?: EditExtras) => recordFor(s, action, extras),
      }),
    }));
    const viaMarkers: MapMarker[] = run.vias.map((v, i) => ({
      id: `via-${i}`,
      lat: v.lat,
      lon: v.lon,
      color: "#7c3aed",
      label: "✦",
    }));
    // Nodes added on the fly: green "+" markers, off the routed sequence.
    const addedMarkers: MapMarker[] = added.map((f) => ({
      id: f.id,
      lat: f.lat,
      lon: f.lon,
      color: "#16a34a",
      label: "+",
    }));
    // Every other nearby fountain — not a survey target — shown dimmed so the
    // runner can tell an already-recorded point from one that needs adding.
    const onRoute = new Set(stops.map((s) => s.id));
    const dimMarkers: MapMarker[] = pool
      .filter((f) => !onRoute.has(f.id))
      .map((f) => ({
        id: f.id,
        lat: f.lat,
        lon: f.lon,
        color: "#9ca3af",
        dimmed: true,
        // Tap to record it in OSM on the fly, same as any route stop.
        popup: createElement(PointPopup, {
          fountain: f,
          loggedIn: !!osm?.loggedIn,
          busy: false,
          onAction: (action: EditAction, extras?: EditExtras) =>
            recordFor({ ...f, status: "pending" }, action, extras),
        }),
      }));
    return [...dimMarkers, ...stopMarkers, ...viaMarkers, ...addedMarkers];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, index, run.vias, added, pool, osm?.loggedIn]);

  const center: [number, number] = pos
    ? [pos.lat, pos.lon]
    : target
      ? [target.lat, target.lon]
      : [run.start.lat, run.start.lon];

  // Fit user + next target both in view when both known; else just center.
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
  const userPos: [number, number] | null = pos ? [pos.lat, pos.lon] : null;

  return {
    // map feed (for a shared <MapView>)
    markers,
    line,
    center,
    userPos,
    userHeading: deviceHeading,
    needsCompassPermission,
    requestCompass,
    recenterKey,
    fitPoints,
    // lifecycle
    hydrating,
    done,
    // guidance state
    stops,
    index,
    target,
    distToTarget,
    bearingTo,
    heading,
    nextTurn,
    distToTurn,
    arrived,
    addLabel,
    added,
    // osm + io state
    osm,
    refresh,
    adding,
    err,
    lastSaved,
    // completion state
    finishing,
    finishErr,
    closed,
    // actions
    setManualArrived,
    record,
    skip,
    goBack,
    addHere,
    addAt,
    finish,
    reset,
  };
}

export type RunSession = ReturnType<typeof useRunSession>;
