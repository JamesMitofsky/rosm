"use client";

import { useEffect, useMemo, useState } from "react";
import { useRun, type RunStop, type StopStatus } from "@/store/run";
import { useOutbox } from "@/store/outbox";
import { bearing, compass, haversine, type Pt } from "@/lib/geo";
import { ptLabel } from "@/lib/pointTypes";
import type { MapMarker } from "@/components/MapView";
import type { EditAction } from "@/lib/schemas";
import { editSummary, todayLocal } from "@/lib/editSummary";
import { useOsmStatus } from "@/components/OsmStatus";
import PointPopup from "@/components/PointPopup";
import { celebratePoint } from "@/lib/confetti";
import { useHeading } from "@/lib/useHeading";
import { archiveRoute } from "@/lib/routeArchive";
import { createElement } from "react";

const STATUS_COLOR: Record<StopStatus, string> = {
  pending: "#9ca3af",
  confirm: "#16a34a",
  dog_only: "#7c3aed",
  out_of_order: "#d97706",
  removed: "#dc2626",
  skipped: "#6b7280",
};

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
    fetch("/api/run")
      .then((r) => r.json())
      .then((plan) => {
        if (plan && plan.stops?.length) useRun.getState().hydrate(plan);
      })
      .finally(() => setHydrating(false));
  }, [enabled]);

  // Live position — only while armed.
  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lon: p.coords.longitude });
        // GPS heading is the travel direction in degrees, present only while
        // moving. Used as fallback when the compass is denied/unsupported.
        if (p.coords.heading != null && Number.isFinite(p.coords.heading)) setGpsHeading(p.coords.heading);
      },
      (e) => setErr(`Location: ${e.message}`),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  const { stops, index, loop, tagKey, tagValue, added } = run;
  const addLabel = ptLabel(tagKey, tagValue);
  const target = stops[index];
  const done = run.hasPlan && index >= stops.length;

  const distToTarget = pos && target ? haversine(pos, target) : null;
  const bearingTo = pos && target ? bearing(pos, target) : 0;
  const heading = target ? compass(bearingTo) : "";

  // Derived: armed manually ("I'm here") or auto within 30 m.
  const arrived = manualArrived || (distToTarget != null && distToTarget < 30);

  async function persist(nextIndex: number, changesetId?: number) {
    const routeId = useRun.getState().routeId;
    const plan = {
      start: run.start,
      loop,
      tagKey,
      tagValue,
      stops: useRun.getState().stops,
      vias: run.vias,
      added: useRun.getState().added,
      routeCoords: run.routeCoords,
      distanceM: run.distanceM,
      index: nextIndex,
      changesetId: changesetId ?? run.changesetId,
    };
    // Durable on-device record of this route + every node change, kept across N
    // routes. Written first so the archive survives even if the server POST fails.
    archiveRoute({ routeId, plan, edits: useOutbox.getState().items });
    await fetch("/api/run", {
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
  // on the map) leaves the position.
  function recordFor(node: RunStop, action: EditAction, comment?: string) {
    const isCurrent = !!target && node.id === target.id;
    setErr(null);
    useOutbox.getState().enqueue({ nodeId: node.id, action, tagKey, name: node.tags?.name, comment });
    run.setStatus(node.id, action as StopStatus);
    celebratePoint();
    setLastSaved({ nodeId: node.id, summary: editSummary(action, tagKey, todayLocal()) });
    if (isCurrent) {
      persist(index + 1);
      advance();
    } else {
      persist(index);
    }
    useOutbox.getState().flush();
  }

  function record(action: EditAction) {
    if (target) recordFor(target, action);
  }

  function skip() {
    setLastSaved(null);
    if (target) run.setStatus(target.id, "skipped");
    advance();
  }

  // Step back to the previous stop and re-open it for action. Resets that stop's
  // status to pending so the arrival actions show again (lets a mis-tap be redone;
  // a re-record just enqueues a fresh OSM edit — last write wins). Does not undo
  // edits already sent. No-op at the first stop.
  function goBack() {
    if (index <= 0) return;
    const pi = index - 1;
    setLastSaved(null);
    setManualArrived(false);
    run.setStatus(stops[pi].id, "pending");
    run.setIndex(pi);
    persist(pi);
  }

  // Create a brand-new node of the surveyed type at the current GPS position.
  // Online-only (needs a fresh node id back from OSM), but shares the outbox's
  // changeset so the create lands with the run's edits.
  async function addHere() {
    if (!osm?.loggedIn) {
      setErr("Sign in to OSM first.");
      return;
    }
    if (!pos) {
      setErr("Waiting for GPS fix.");
      return;
    }
    setAdding(true);
    setErr(null);
    setLastSaved(null);
    try {
      const r = await fetch("/api/osm/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: pos.lat,
          lon: pos.lon,
          tag: { key: tagKey, value: tagValue },
          changesetId: useOutbox.getState().changesetId,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "create failed");
      useOutbox.getState().setChangeset(j.changesetId);
      run.addNode({ id: j.nodeId, lat: j.lat, lon: j.lon, tags: j.tags });
      celebratePoint();
      setLastSaved({ nodeId: j.nodeId, summary: j.summary });
      await persist(index);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function finish() {
    setFinishing(true);
    setFinishErr(null);
    try {
      const changesetId = useOutbox.getState().changesetId;
      if (changesetId) {
        const r = await fetch("/api/osm/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changesetId }),
        });
        const j = await r.json();
        if (!r.ok || j.ok === false) throw new Error(j.error || "close failed");
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
        onAction: (action: EditAction, comment?: string) => recordFor(s, action, comment),
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
    return [...stopMarkers, ...viaMarkers, ...addedMarkers];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, index, run.vias, added, osm?.loggedIn]);

  const center: [number, number] = pos
    ? [pos.lat, pos.lon]
    : target
      ? [target.lat, target.lon]
      : [run.start.lat, run.start.lon];

  const recenterKey = pos ? `${pos.lat.toFixed(4)},${pos.lon.toFixed(4)}` : "t";
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
    finish,
    reset,
  };
}

export type RunSession = ReturnType<typeof useRunSession>;
