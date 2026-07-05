"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPinIcon,
  CrosshairIcon,
  PathIcon,
  MagnifyingGlassIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsLeftRightIcon,
  SlidersHorizontalIcon,
  DeviceMobileIcon,
} from "@phosphor-icons/react";
import { planRoute } from "@/lib/plan";
import { fmtDist, milesToMeters, type Pt } from "@/lib/geo";
import type { Turn } from "@/lib/brouter";
import type { Fountain, EditAction, EditExtras, RecencyMode } from "@/lib/schemas";
import { useRun, type RunStop, type StopStatus } from "@/store/run";
import { useOutbox, outboxCounts } from "@/store/outbox";
import type { MapMarker } from "@/components/MapView";
import OsmStatusBar, { useOsmStatus } from "@/components/OsmStatus";
import PointPopup, { type PointEdit } from "@/components/PointPopup";
import SyncStatus from "@/components/SyncStatus";
import RunGuide from "@/components/run/RunGuide";
import RunComplete from "@/components/run/RunComplete";
import CompassEnableModal from "@/components/run/CompassEnableModal";
import { useRunSession } from "@/hooks/useRunSession";
import { celebratePoint } from "@/lib/confetti";
import { apiFetch, isNative } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geolocation";
import { getArchivedRoutes } from "@/lib/routeArchive";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

// Snapshot of an in-progress planner route, persisted so a refresh can resume it.
type Draft = {
  center: Pt;
  tag: { key: string; value: string };
  radiusMi: number | "";
  recencyMode: RecencyMode;
  recencyMonths: number | "";
  targetMi: number | "";
  loop: boolean;
  fountains: Fountain[];
  pinnedIds: number[];
  excludedIds: number[];
  vias: Pt[];
  stops: Fountain[];
  line: [number, number][];
  distanceM: number;
  turns: Turn[];
  autoCount: number;
};

// Marker colors for points already updated in OSM this session.
const EDIT_COLOR: Partial<Record<StopStatus, string>> = {
  confirm: "#16a34a",
  dog_only: "#7c3aed",
  out_of_order: "#d97706",
  removed: "#dc2626",
};
const EDIT_LABEL: Partial<Record<StopStatus, string>> = {
  confirm: "✓",
  dog_only: "🐕",
  out_of_order: "!",
  removed: "✕",
};

// Recency filter modes, shown as a segmented control in the radius step.
const RECENCY_MODES: { key: RecencyMode; label: string }[] = [
  { key: "stale", label: "Not checked in" },
  { key: "fresh", label: "Checked within" },
  { key: "any", label: "Any time" },
];

// The guided config steps, answered one at a time before the map takes over.
const STEPS = [
  { key: "where", title: "Where do you start?", hint: "Click on the map or search" },
  { key: "radius", title: "How wide should we search?", hint: undefined },
] as const;

// Module-scoped monotonic counters (the planner is a single-instance route).
// Kept out of refs so the route-building call graph stays ref-free and the React
// Compiler can treat it as pure. `planRequestSeq` drops stale overlapping plans;
// `recenterSeq` forces the map to recenter even when coords repeat.
let planRequestSeq = 0;
let recenterSeq = 0;

// The device class can't change mid-session, so the mobile check never
// re-notifies — subscribe is a stable no-op (required by useSyncExternalStore).
const subscribeNever = () => () => {};

export default function PlannerPage() {
  const router = useRouter();
  const setPlan = useRun((s) => s.setPlan);
  const { status: osm } = useOsmStatus();

  // "config" walks the questions; "map" hides them to build the route; "run"
  // takes the SAME map live for the survey, swapping only the side panel — no
  // navigation, so the map never reloads under the user.
  const [phase, setPhase] = useState<"config" | "map" | "run">("config");
  const [step, setStep] = useState(0);

  // Route planning + the live run rely on the phone's GPS and compass, so the
  // planner is gated to mobile. null = not yet determined (the server snapshot,
  // so SSR never flashes the wrong screen before the client checks the device).
  const isMobileDevice = useSyncExternalStore<boolean | null>(
    subscribeNever,
    () =>
      isNative() || (window.matchMedia("(pointer: coarse)").matches && "ontouchstart" in window),
    () => null,
  );

  // The live run, fed from the shared hook. Armed only once we reach the run
  // phase so the location prompt doesn't fire while building a route.
  const session = useRunSession({ enabled: phase === "run" });

  const [center, setCenter] = useState<Pt | null>(null);
  const [vias, setVias] = useState<Pt[]>([]);
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [recenterKey, setRecenterKey] = useState("init");
  const [addr, setAddr] = useState("");
  const [radiusMi, setRadiusMi] = useState<number | "">(3);
  // Recency filter: by default surface points NOT surveyed in the last 6 months
  // (the ones worth verifying on the ground). "fresh" flips it; "any" disables.
  const [recencyMode, setRecencyMode] = useState<RecencyMode>("stale");
  const [recencyMonths, setRecencyMonths] = useState<number | "">(6);
  const [targetMi, setTargetMi] = useState<number | "">("");
  // How the route is sized: to a target distance, or purely by the points picked.
  // Default to points so the route is sized by what the user picks unless they opt
  // into a target distance (matches "empty target distance by default").
  const [sizeMode, setSizeMode] = useState<"distance" | "points">("points");
  const [loop, setLoop] = useState(true);
  const [tag, setTag] = useState({ key: "amenity", value: "drinking_water" });

  const [fountains, setFountains] = useState<Fountain[]>([]);
  const [stops, setStops] = useState<Fountain[]>([]);
  // Points the user explicitly took OUT of the route (e.g. auto-grabbed ones they
  // don't want). They stay excluded so re-planning / auto-pickup won't re-add them.
  const [excludedIds, setExcludedIds] = useState<number[]>([]);
  const [line, setLine] = useState<[number, number][]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  // True once a route is built; gates the auto-replan effect so picks/removes
  // update the route live without re-running the whole planner by hand.
  const [hasRoute, setHasRoute] = useState(false);
  // Coords of a point BRouter can't reach on foot ("target island"), highlighted
  // on the map so the user can see exactly where the route breaks.
  const [islandPt, setIslandPt] = useState<Pt | null>(null);
  // How many stops were auto-grabbed (tiny detour off the route), for the summary.
  const [autoCount, setAutoCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Whether the current error is a transient server failure worth retrying.
  const [errRetryable, setErrRetryable] = useState(false);

  // Session recovery: a saved route from a previous (interrupted) session, and a
  // gate so we don't persist a draft until the initial load has run.
  const [resumable, setResumable] = useState<Draft | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  // Direct OSM edits made from the map, before any run. Backed by the offline
  // outbox: saved on-device first, sent to OSM in the background.
  const outboxItems = useOutbox((s) => s.items);
  const outboxChangeset = useOutbox((s) => s.changesetId);
  const [closingEdits, setClosingEdits] = useState(false);

  // Latest queued edit per node, for the marker color/label + popup feedback.
  const edits = useMemo(() => {
    const m: Record<number, PointEdit> = {};
    for (const it of outboxItems) {
      m[it.nodeId] = {
        status: it.action as StopStatus,
        summary: it.summary,
        syncState: it.syncState,
        changesetUrl: it.changesetUrl,
        extras: it.extras,
      };
    }
    return m;
  }, [outboxItems]);

  const scope = useRef<HTMLElement>(null);

  // Fade the active question in whenever the step changes. Opacity only — no
  // transforms, so an interrupted tween can never leave a translated ghost copy.
  useGSAP(
    () => {
      gsap.fromTo(
        ".wizard-step",
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.4, ease: "power3.out" },
      );
    },
    { dependencies: [step], scope },
  );

  // Fade the floating card when switching between config and map-only views.
  useGSAP(
    () => {
      gsap.fromTo(
        ".phase-card",
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.5, ease: "power3.out" },
      );
    },
    { dependencies: [phase], scope },
  );

  // Status resolved to logged-out → bounce to the dedicated sign-in page. Only
  // on mobile; desktop users see the "plan on your phone" intercept instead.
  useEffect(() => {
    if (isMobileDevice && osm && !osm.loggedIn) router.replace("/plan/login");
  }, [isMobileDevice, osm, router]);

  // On mount, recover an in-progress run (the run now lives here, not on a
  // separate page — a reload mid-survey must drop straight back into it). A
  // finished run (index past the last stop) is ignored so it can't hijack a
  // fresh planning session.
  useEffect(() => {
    // Native: recover an interrupted run from the on-device archive (no server
    // run state). Web: read it back from /api/run. Deferred off the effect body so
    // the state update doesn't cascade-render synchronously.
    if (isNative()) {
      Promise.resolve().then(() => {
        const plan = getArchivedRoutes()[0]?.plan;
        if (plan && plan.stops?.length && (plan.index ?? 0) < plan.stops.length) {
          useRun.getState().hydrate(plan);
          setPhase("run");
        }
      });
      return;
    }
    apiFetch("/api/run")
      .then((r) => r.json())
      .then((plan) => {
        if (plan && plan.stops?.length && (plan.index ?? 0) < plan.stops.length) {
          useRun.getState().hydrate(plan);
          setPhase("run");
        }
      })
      .catch(() => {});
  }, []);

  // On mount, look for a saved route from a prior session. If one exists, offer
  // to resume it rather than restoring silently (the user may want a fresh plan).
  useEffect(() => {
    apiFetch("/api/draft")
      .then((r) => r.json())
      .then((d: Draft | null) => {
        if (d && d.stops?.length) setResumable(d);
      })
      .catch(() => {})
      .finally(() => setDraftReady(true));
  }, []);

  // Persist the built route whenever it changes, so a refresh can recover it.
  // Skipped until the initial load runs, while a resume offer is pending, and
  // before any route exists.
  useEffect(() => {
    if (!draftReady || resumable || stops.length === 0) return;
    const draft: Draft = {
      center: center!,
      tag,
      radiusMi,
      recencyMode,
      recencyMonths,
      targetMi,
      loop,
      fountains,
      pinnedIds,
      excludedIds,
      vias,
      stops,
      line,
      distanceM,
      turns,
      autoCount,
    };
    apiFetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => {});
  }, [
    draftReady,
    resumable,
    center,
    tag,
    radiusMi,
    recencyMode,
    recencyMonths,
    targetMi,
    loop,
    fountains,
    pinnedIds,
    excludedIds,
    vias,
    stops,
    line,
    distanceM,
    turns,
    autoCount,
  ]);

  // Restore a saved route into the planner and jump to the map.
  function resumeDraft() {
    const d = resumable;
    if (!d) return;
    recenter(d.center);
    setTag(d.tag);
    setRadiusMi(d.radiusMi);
    setRecencyMode(d.recencyMode ?? "stale");
    setRecencyMonths(d.recencyMonths ?? 6);
    setTargetMi(d.targetMi);
    setLoop(d.loop);
    setFountains(d.fountains);
    setPinnedIds(d.pinnedIds);
    setExcludedIds(d.excludedIds ?? []);
    setVias(d.vias);
    setStops(d.stops);
    setLine(d.line);
    setDistanceM(d.distanceM);
    setTurns(d.turns ?? []);
    setAutoCount(d.autoCount);
    setHasRoute(d.stops.length > 0);
    setResumable(null);
    setPhase("map");
  }

  // Drop the saved route — the user wants to start fresh.
  function dismissDraft() {
    setResumable(null);
    apiFetch("/api/draft", { method: "DELETE" }).catch(() => {});
  }

  function recenter(p: Pt) {
    setCenter(p);
    setRecenterKey(`${p.lat},${p.lon},${++recenterSeq}`);
  }

  // Marks the user pins, resolved to fountains and forced into the route.
  // Excluded points can never be pinned (removing a point also unpins it).
  const pinned = useMemo(
    () => fountains.filter((f) => pinnedIds.includes(f.id) && !excludedIds.includes(f.id)),
    [fountains, pinnedIds, excludedIds],
  );

  // Points the user removed from the route, resolved to fountains for the list.
  const removed = useMemo(
    () => fountains.filter((f) => excludedIds.includes(f.id)),
    [fountains, excludedIds],
  );

  // A point is "in the route" if it's a chosen stop or a required pin (and not
  // explicitly removed). Drives marker color + the popup's add/remove toggle.
  const inRouteIds = useMemo(() => {
    const s = new Set<number>(pinnedIds);
    stops.forEach((f) => s.add(f.id));
    excludedIds.forEach((id) => s.delete(id));
    return s;
  }, [stops, pinnedIds, excludedIds]);

  function handleMapClick(lat: number, lon: number) {
    // The start point can only be set during the first setup step ("where").
    // Later config steps ignore map clicks so the start can't move by accident.
    if (phase === "config") {
      if (step === 0) recenter({ lat, lon });
      return;
    }
    // Map phase: a click drops a pass-through waypoint.
    if (center) {
      const v = [...vias, { lat, lon }];
      setVias(v);
      replan({ v });
    }
  }

  // Remove a pass-through waypoint and re-plan around the rest.
  function removeVia(i: number) {
    const v = vias.filter((_, j) => j !== i);
    setVias(v);
    replan({ v });
  }

  // Once a route exists, every membership change re-plans immediately with the
  // new picks (passed explicitly — setState is async). `replan` is a no-op
  // before the first route is built (the "Plan route" button does that).
  function replan(o: { pins?: number[]; excludes?: number[]; v?: Pt[]; lp?: boolean }) {
    if (hasRoute) planAndRoute(o);
  }

  // Force a point into the route (pin it) and clear any prior removal.
  function addStop(id: number) {
    const excludes = excludedIds.filter((x) => x !== id);
    const pins = pinnedIds.includes(id) ? pinnedIds : [...pinnedIds, id];
    setExcludedIds(excludes);
    setPinnedIds(pins);
    replan({ pins, excludes });
  }

  // Take a point out of the route and keep it out: exclude it (so re-planning /
  // auto-pickup won't grab it again) and drop any pin.
  function removeStop(id: number) {
    const pins = pinnedIds.filter((x) => x !== id);
    const excludes = excludedIds.includes(id) ? excludedIds : [...excludedIds, id];
    setPinnedIds(pins);
    setExcludedIds(excludes);
    replan({ pins, excludes });
  }

  // Tap a marker to add it; tap again to remove it. The route re-plans on every
  // change.
  function toggleStop(id: number) {
    if (inRouteIds.has(id)) removeStop(id);
    else addStop(id);
  }

  // Undo a removal: let the planner consider the point again (it may be re-picked
  // by distance fill or small-detour pickup).
  function restoreStop(id: number) {
    const excludes = excludedIds.filter((x) => x !== id);
    setExcludedIds(excludes);
    replan({ excludes });
  }

  // Update a point straight from the map. Offline-first: queued on-device and
  // celebrated immediately, then sent to OSM in the background. Edits batch into
  // one changeset (opened by the API on the first successful send).
  function updatePoint(nodeId: number, action: EditAction, name?: string, extras?: EditExtras) {
    setErr(null);
    useOutbox.getState().enqueue({ nodeId, action, tagKey: tag.key, name, extras });
    celebratePoint();
    useOutbox.getState().flush();
  }

  // Close the open edit changeset so it's not left dangling on OSM.
  async function closeEdits() {
    const changesetId = useOutbox.getState().changesetId;
    if (!changesetId) return;
    setClosingEdits(true);
    setErr(null);
    try {
      const r = await apiFetch("/api/osm/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changesetId }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "close failed");
      useOutbox.getState().setChangeset(undefined);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setClosingEdits(false);
    }
  }

  const editCount = Object.keys(edits).length;
  const outboxUnsent = outboxCounts(outboxItems).unsent;

  function markLabel(f: Fountain) {
    return f.tags.name ?? "Unnamed fountain";
  }

  function geolocate() {
    setErr(null);
    getCurrentPosition()
      .then((p) => recenter({ lat: p.lat, lon: p.lon }))
      .catch((e) => setErr(`Geolocation failed: ${(e as Error).message}`));
  }

  async function searchAddr() {
    if (!addr.trim()) return;
    setBusy("search");
    setErr(null);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`,
      );
      const j = (await r.json()) as { lat: string; lon: string }[];
      if (j[0]) recenter({ lat: Number(j[0].lat), lon: Number(j[0].lon) });
      else setErr("Address not found");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function findPoints() {
    if (!center) return;
    // Building fresh — drop any pending resume offer so the new route persists.
    setResumable(null);
    setBusy("find");
    setErr(null);
    setErrRetryable(false);
    setStops([]);
    setLine([]);
    setTurns([]);
    setPinnedIds([]);
    setExcludedIds([]);
    setAutoCount(0);
    setHasRoute(false);
    setIslandPt(null);
    try {
      const r = await apiFetch("/api/fountains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...center,
          radiusM: milesToMeters(radiusMi || 0),
          tag,
          recencyMode,
          recencyMonths: recencyMonths || 6,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        const e = j.error;
        // Error can be a zod flatten ({formErrors}), a structured Overpass
        // error ({message, retryable}), or a plain string.
        const msg =
          e?.formErrors?.join(", ") ||
          e?.message ||
          (typeof e === "string" ? e : "") ||
          "Couldn't load points. Please try again.";
        setErrRetryable(!!e?.retryable);
        throw new Error(msg);
      }
      setFountains(j.fountains);
      if (j.fountains.length === 0) setErr("No matching points in radius.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Last config step: run the search, then hand the screen over to the map.
  async function finishConfig() {
    await findPoints();
    setPhase("map");
  }

  // Plan + fetch street geometry. Picks/removes pass the *new* ids/waypoints
  // explicitly (state setters are async, so reading state here could be stale),
  // falling back to current state for the "Plan route" button.
  type PlanOverride = { pins?: number[]; excludes?: number[]; v?: Pt[]; lp?: boolean };
  async function planAndRoute(o: PlanOverride = {}) {
    if (!center || fountains.length === 0) return;
    const pins = o.pins ?? pinnedIds;
    const excludes = o.excludes ?? excludedIds;
    const v = o.v ?? vias;
    const lp = o.lp ?? loop;
    // In points mode the route is sized purely by what the user picks, so the
    // target distance is ignored even if a value is left in the field.
    const target = sizeMode === "distance" ? targetMi || 0 : 0;
    // Rapid taps fire overlapping plans; only the latest may write results, so a
    // slow earlier fetch can't clobber a newer route.
    const seq = ++planRequestSeq;
    const fresh = () => seq === planRequestSeq;
    setBusy("route");
    setErr(null);
    setIslandPt(null);
    try {
      const { ordered, autoIds } = planRoute({
        start: center,
        // Excluded points are out of the running entirely — never re-picked.
        candidates: fountains.filter((f) => !excludes.includes(f.id)),
        vias: v,
        pinned: fountains.filter((f) => pins.includes(f.id) && !excludes.includes(f.id)),
        targetM: milesToMeters(target),
        loop: lp,
      });
      const chosen = ordered.filter((n) => n.fountain).map((n) => n.fountain!);
      if (ordered.length === 0) {
        if (!fresh()) return;
        setErr(
          sizeMode === "distance"
            ? "No points fit that distance. Increase target distance or add via-points."
            : "No points left in the route — add one back or pin a point.",
        );
        setStops([]);
        setLine([]);
        setDistanceM(0);
        setTurns([]);
        setAutoCount(0);
        // Stay "live" (don't reset hasRoute) so adding a point back re-plans.
        return;
      }
      const points = [center, ...ordered.map((n) => ({ lat: n.lat, lon: n.lon }))];
      const r = await apiFetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points, loop: lp }),
      });
      const j = await r.json();
      if (!fresh()) return; // a newer plan superseded this one
      if (!r.ok) {
        if (j.island) setIslandPt(j.island as Pt);
        throw new Error(j.error || "routing failed");
      }
      setStops(chosen);
      setAutoCount(autoIds.length);
      setLine((j.coords as [number, number][]).map(([lon, lat]) => [lat, lon]));
      setDistanceM(j.distanceM);
      setTurns((j.turns as Turn[]) ?? []);
      setHasRoute(true);
    } catch (e) {
      if (fresh()) setErr((e as Error).message);
    } finally {
      if (fresh()) setBusy(null);
    }
  }

  // "Plan route" button: validate inputs, then build.
  async function makeRoute() {
    if (!center || fountains.length === 0) return;
    const target = sizeMode === "distance" ? targetMi || 0 : 0;
    if (sizeMode === "distance" && target <= 0) {
      setErr("Enter a target distance.");
      return;
    }
    // Points mode: the route is sized by the points the user picks — so they have
    // to pick at least one (a pin or a waypoint) to define it.
    if (sizeMode === "points" && pinned.length === 0 && vias.length === 0) {
      setErr("Pin a point or add a waypoint to size your route.");
      return;
    }
    await planAndRoute();
  }

  // Flip the visiting order of the route. Start (your location) stays fixed; the
  // stops are walked in reverse, and the street geometry is re-fetched so one-way
  // streets and turn costs are respected in the new direction.
  async function reverseRoute() {
    if (!center || stops.length < 2 || busy !== null) return;
    const reversed = [...stops].reverse();
    setBusy("reverse");
    setErr(null);
    setIslandPt(null);
    const seq = ++planRequestSeq;
    const fresh = () => seq === planRequestSeq;
    try {
      const points = [center, ...reversed.map((f) => ({ lat: f.lat, lon: f.lon }))];
      const r = await apiFetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points, loop }),
      });
      const j = await r.json();
      if (!fresh()) return;
      if (!r.ok) {
        if (j.island) setIslandPt(j.island as Pt);
        throw new Error(j.error || "routing failed");
      }
      setStops(reversed);
      setLine((j.coords as [number, number][]).map(([lon, lat]) => [lat, lon]));
      setDistanceM(j.distanceM);
      setTurns((j.turns as Turn[]) ?? []);
    } catch (e) {
      if (fresh()) setErr((e as Error).message);
    } finally {
      if (fresh()) setBusy(null);
    }
  }

  async function startRun() {
    if (!center || stops.length === 0) return;
    const runStops: RunStop[] = stops.map((f) => ({ ...f, status: "pending" }));
    const plan = {
      start: center,
      loop,
      tagKey: tag.key,
      tagValue: tag.value,
      stops: runStops,
      vias,
      pool: fountains,
      added: [],
      routeCoords: line.map(([lat, lon]) => [lon, lat] as [number, number]),
      distanceM,
      turns,
    };
    setPlan(plan);
    await apiFetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...plan, index: 0 }),
    });
    // Route promoted to an active run; drop the planner draft so we don't re-offer it.
    apiFetch("/api/draft", { method: "DELETE" }).catch(() => {});
    // Stay on this map — just hand the side panel over to the live run.
    setPhase("run");
  }

  // Leave the finished run and return to a clean planner, keeping the start area
  // so the surveyor can quickly build another route nearby.
  function exitRun() {
    session.reset();
    setStops([]);
    setLine([]);
    setTurns([]);
    setFountains([]);
    setHasRoute(false);
    setPinnedIds([]);
    setExcludedIds([]);
    setVias([]);
    setDistanceM(0);
    setAutoCount(0);
    setStep(0);
    setPhase("config");
  }

  const markers: MapMarker[] = useMemo(() => {
    const chosenIds = new Map(stops.map((s, i) => [s.id, i + 1]));
    const pinnedSet = new Set(pinnedIds);
    const excludedSet = new Set(excludedIds);
    return fountains.map((f) => {
      const n = chosenIds.get(f.id);
      const isPinned = pinnedSet.has(f.id);
      const isExcluded = excludedSet.has(f.id);
      const inRoute = inRouteIds.has(f.id);
      const edit = edits[f.id];
      // edited (this session) wins; then: dim "–" = explicitly removed; green
      // numbered = chosen; amber star = pinned (forced); gray = available.
      const color = edit
        ? (EDIT_COLOR[edit.status] ?? "#9ca3af")
        : isExcluded
          ? "#52525b"
          : n
            ? "#16a34a"
            : isPinned
              ? "#f59e0b"
              : "#9ca3af";
      const label = edit
        ? EDIT_LABEL[edit.status]
        : isExcluded
          ? "–"
          : n
            ? String(n)
            : isPinned
              ? "★"
              : undefined;
      return {
        id: f.id,
        lat: f.lat,
        lon: f.lon,
        color,
        label,
        // Tap adds/removes the point; the route re-plans automatically.
        onClick: () => toggleStop(f.id),
        // Long-press / right-click opens the popup to update the point in OSM.
        popupTrigger: "contextmenu" as const,
        popup: (
          <PointPopup
            fountain={f}
            loggedIn={!!osm?.loggedIn}
            inRoute={inRoute}
            edit={edit}
            busy={false}
            onToggleRoute={() => toggleStop(f.id)}
            onAction={(action, extras) => updatePoint(f.id, action, markLabel(f), extras)}
          />
        ),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fountains, stops, pinnedIds, excludedIds, inRouteIds, edits, osm?.loggedIn]);

  // Highlight the unreachable ("target island") point, if any.
  const islandMarker: MapMarker[] = islandPt
    ? [{ id: "island", lat: islandPt.lat, lon: islandPt.lon, color: "#dc2626", label: "!" }]
    : [];

  const startMarker: MapMarker[] = center
    ? [{ id: "start", lat: center.lat, lon: center.lon, color: "#16a34a", label: "⚑" }]
    : [];

  const viaMarkers: MapMarker[] = vias.map((v, i) => ({
    id: `via-${i}`,
    lat: v.lat,
    lon: v.lon,
    color: "#7c3aed",
    label: "✦",
    onClick: () => removeVia(i),
  }));

  const active = STEPS[step];
  const canAdvance = step === 0 ? !!center : true;

  // Whether the current sizing mode has enough input to plan a route.
  const sizingReady =
    sizeMode === "distance" ? (targetMi || 0) > 0 : pinned.length > 0 || vias.length > 0;
  const planHint = sizeMode === "distance" ? "Enter a target distance above." : null;

  // Not a phone → intercept. You navigate the route on foot with your phone's
  // GPS/compass, so planning belongs there too. Blank while the check resolves.
  if (isMobileDevice === null) {
    return <main className="bg-paper h-screen w-screen" />;
  }
  if (!isMobileDevice) {
    return (
      <main className="bg-paper font-body text-ink flex min-h-screen w-screen items-center justify-center px-6">
        <div className="flex max-w-md flex-col items-center gap-5 text-center">
          <DeviceMobileIcon size={48} weight="duotone" className="text-sky-deep" />
          <h1 className="font-display text-2xl leading-tight font-bold">Plan this on your phone</h1>
          <p className="text-ink-dim">
            Routes have to be planned on your phone since that&apos;s how you navigate around!
          </p>
          <Link
            href="/"
            className="border-ink text-ink hover:bg-ink hover:text-paper rounded-full border px-5 py-2 text-sm font-bold transition"
          >
            Back home
          </Link>
        </div>
      </main>
    );
  }

  // Gate the whole planner behind OSM sign-in — no map until logged in. Once the
  // status resolves to logged-out, send the user to the dedicated sign-in page.
  if (osm === null) {
    return <main className="bg-paper h-screen w-screen" />;
  }
  if (!osm.loggedIn) {
    // Redirect handled by the effect above; render blank while it fires.
    return <main className="bg-paper h-screen w-screen" />;
  }

  // The map view tracks the chosen start point.
  const DEFAULT_CENTER: [number, number] = [38.9072, -77.0369];
  const viewCenter: [number, number] = center ? [center.lat, center.lon] : DEFAULT_CENTER;
  const viewKey = recenterKey;

  return (
    <main
      ref={scope}
      className="safe-pb bg-paper font-body text-ink relative flex min-h-screen w-screen flex-col md:block md:h-screen md:overflow-hidden"
    >
      {/* Mobile: map sits at the top with a fixed height and the panel flows below it.
          Desktop (md+): map fills the screen and the cards float on top. */}
      <div className="relative h-[55vh] w-full shrink-0 md:absolute md:inset-0 md:h-full">
        <MapView
          center={phase === "run" ? session.center : viewCenter}
          zoom={phase === "run" ? 16 : 14}
          recenterKey={phase === "run" ? session.recenterKey : viewKey}
          fitPoints={phase === "run" ? session.fitPoints : undefined}
          markers={
            phase === "run"
              ? session.markers
              : [...markers, ...viaMarkers, ...startMarker, ...islandMarker]
          }
          line={phase === "run" ? session.line : line}
          userPos={phase === "run" ? session.userPos : undefined}
          userHeading={phase === "run" ? session.userHeading : undefined}
          onMapClick={phase === "run" ? undefined : handleMapClick}
          className="absolute inset-0 h-full w-full"
        />
        {phase === "run" && (
          <CompassEnableModal
            open={session.needsCompassPermission}
            onEnable={session.requestCompass}
          />
        )}
      </div>

      {/* Top bar: OSM status, floating over the map. Hidden during a run so the
          map is the topmost element on the route — nothing overlaps its top edge. */}
      {phase !== "run" && (
        <header className="safe-top pointer-events-none absolute inset-x-0 z-[1000] flex flex-wrap items-center justify-start gap-3 p-4 md:p-5">
          <div className="pointer-events-auto">
            <OsmStatusBar />
          </div>
        </header>
      )}

      {/* Resume offer: a route from a prior session survived a refresh. */}
      {resumable && (
        <div className="border-sky-deep/40 bg-paper-deep/95 pointer-events-auto absolute top-20 left-1/2 z-[1001] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-3 rounded-2xl border p-4 shadow-2xl backdrop-blur-md md:top-6">
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-ink text-sm font-bold">Resume your route?</span>
            <span className="text-ink-dim text-xs">
              {resumable.stops.length} stops · {fmtDist(resumable.distanceM)} — saved from your last
              session.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resumeDraft}
              className="bg-ink text-paper hover:bg-ink-soft flex-1 rounded-full py-2 text-sm font-bold transition"
            >
              Resume
            </button>
            <button
              onClick={dismissDraft}
              className="border-paper-line text-ink-dim hover:text-ink rounded-full border px-4 py-2 text-sm font-semibold transition"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}

      {/* ----- CONFIG PHASE: one question at a time ----- */}
      {phase === "config" && (
        <div className="phase-card z-[1000] flex flex-1 justify-center p-4 md:absolute md:inset-y-0 md:right-auto md:left-0 md:flex-none md:items-center md:p-6">
          <section className="flex w-full max-w-md flex-col gap-5 md:h-full">
            {/* Step progress */}
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => (
                <div
                  key={s.key}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-sky-deep" : "bg-paper-deep"}`}
                />
              ))}
            </div>

            <div className="wizard-step flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-2xl leading-tight font-bold">{active.title}</h2>
                {active.hint && <p className="text-ink-dim text-sm">{active.hint}</p>}
              </div>

              {/* Step 1 — start location */}
              {active.key === "where" && (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <div className="border-paper-line bg-paper/40 focus-within:border-sky-deep/60 flex flex-1 items-center gap-2 rounded-lg border px-2">
                      <MagnifyingGlassIcon size={16} className="text-ink-dim" />
                      <input
                        className="text-ink placeholder:text-ink-dim w-full bg-transparent py-2 text-sm outline-none"
                        placeholder="Search address / city"
                        value={addr}
                        onChange={(e) => setAddr(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && searchAddr()}
                      />
                    </div>
                    <button
                      onClick={geolocate}
                      title="Use my location"
                      className="border-paper-line bg-paper/40 text-ink hover:border-sky-deep/60 hover:text-sky-deep rounded-lg border px-3 transition"
                    >
                      <CrosshairIcon size={18} />
                    </button>
                  </div>
                  {!center && (
                    <p className="border-paper-line bg-paper/40 text-ink-dim rounded-lg border px-3 py-2 text-xs">
                      No start point yet — search, locate, or tap the map.
                    </p>
                  )}
                </div>
              )}

              {/* Step 2 — search radius (defines the pool of points to choose from) */}
              {active.key === "radius" && (
                <div className="flex flex-col gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={radiusMi}
                      onChange={(e) =>
                        setRadiusMi(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="border-paper-line bg-paper/40 text-ink focus:border-sky-deep/60 w-20 rounded-lg border px-2 py-2 outline-none"
                    />
                    mile search radius
                  </label>

                  {/* Recency filter — narrow the pool by when each point was last
                      surveyed (OSM check_date). Defaults to points not checked in
                      the last 6 months: the ones worth verifying on the ground. */}
                  <div className="flex flex-col gap-2">
                    <div className="border-paper-line flex overflow-hidden rounded-lg border text-xs">
                      {RECENCY_MODES.map((m) => (
                        <button
                          key={m.key}
                          onClick={() => setRecencyMode(m.key)}
                          className={`flex-1 py-1.5 transition ${recencyMode === m.key ? "bg-sky-deep text-ink font-semibold" : "bg-paper/40 text-ink-dim hover:text-ink"}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    {recencyMode !== "any" && (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={recencyMonths}
                          onChange={(e) =>
                            setRecencyMonths(e.target.value === "" ? "" : Number(e.target.value))
                          }
                          className="border-paper-line bg-paper/40 text-ink focus:border-sky-deep/60 w-20 rounded-lg border px-2 py-2 outline-none"
                        />
                        <span className="text-ink-dim">months</span>
                      </label>
                    )}
                    <p className="text-ink-dim text-xs">
                      {recencyMode === "stale"
                        ? `Show points not surveyed in the last ${recencyMonths || 6} months (or never) — the ones worth checking.`
                        : recencyMode === "fresh"
                          ? `Show only points surveyed within the last ${recencyMonths || 6} months.`
                          : "Show all matching points regardless of when last surveyed."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {err && (
              <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">
                <span>{err}</span>
                {errRetryable && (
                  <button
                    type="button"
                    onClick={findPoints}
                    disabled={busy === "find"}
                    className="self-start rounded-md border border-red-500/40 px-2 py-1 text-xs font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {busy === "find" ? "Trying…" : "Try again"}
                  </button>
                )}
              </div>
            )}

            {/* Wizard nav */}
            <div className="mt-auto flex items-center gap-3 pt-4 pb-4 md:pb-0">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="border-paper-line text-ink-dim hover:text-ink flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-0"
              >
                <ArrowLeftIcon size={16} />
                Back
              </button>
              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                  disabled={!canAdvance}
                  className="bg-ink text-paper hover:bg-ink-soft disabled:hover:bg-ink ml-auto flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold transition disabled:opacity-40"
                >
                  Next
                  <ArrowRightIcon size={16} />
                </button>
              ) : (
                <button
                  onClick={finishConfig}
                  disabled={!center || busy !== null}
                  className="bg-ink text-paper hover:bg-ink-soft disabled:hover:bg-ink ml-auto flex w-40 items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-40"
                >
                  <MapPinIcon size={16} />
                  {busy === "find" ? "Finding…" : "Find points"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ----- MAP PHASE: map-first, controls float over it ----- */}
      {phase === "map" && (
        <>
          <div className="phase-card z-[1000] flex justify-center p-4 md:absolute md:inset-y-0 md:right-0 md:left-auto md:items-center md:p-6">
            <section className="flex w-full max-w-sm flex-col gap-4 md:max-h-[calc(100vh-7rem)] md:overflow-y-auto">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold">Build the route</h2>
                <button
                  onClick={() => setPhase("config")}
                  className="border-paper-line text-ink-dim hover:border-sky-deep/60 hover:text-sky-deep flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                >
                  <SlidersHorizontalIcon size={14} />
                  Edit setup
                </button>
              </div>
              {fountains.length > 0 && (
                <span className="bg-sky/15 text-sky-deep -mt-2 w-fit rounded-full px-2 py-0.5 text-xs font-semibold">
                  {fountains.length} found
                </span>
              )}

              {/* Route sizing: by a target distance, or by the points picked.
                  Collapses away once a route exists to free vertical space. */}
              <AnimatePresence initial={false}>
                {stops.length === 0 && (
                  <motion.div
                    key="sizing"
                    initial={false}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex flex-col gap-2 overflow-hidden"
                  >
                    <div className="border-paper-line flex overflow-hidden rounded-lg border text-sm">
                      <button
                        onClick={() => setSizeMode("distance")}
                        className={`flex-1 py-1.5 transition ${sizeMode === "distance" ? "bg-sky-deep text-ink font-semibold" : "bg-paper/40 text-ink-dim hover:text-ink"}`}
                      >
                        Target distance
                      </button>
                      <button
                        onClick={() => setSizeMode("points")}
                        className={`flex-1 py-1.5 transition ${sizeMode === "points" ? "bg-sky-deep text-ink font-semibold" : "bg-paper/40 text-ink-dim hover:text-ink"}`}
                      >
                        By waypoints
                      </button>
                    </div>
                    {sizeMode === "distance" && (
                      <label className="flex flex-col gap-1 text-sm">
                        Target run (mi)
                        <input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={targetMi}
                          onChange={(e) =>
                            setTargetMi(e.target.value === "" ? "" : Number(e.target.value))
                          }
                          className="border-paper-line bg-paper/40 text-ink focus:border-sky-deep/60 rounded-lg border px-2 py-2 outline-none"
                        />
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={loop}
                        onChange={(e) => {
                          const lp = e.target.checked;
                          setLoop(lp);
                          replan({ lp });
                        }}
                        className="accent-sky-deep h-4 w-4"
                      />
                      Loop (finish back at start)
                    </label>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Map interaction help */}
              <div className="flex flex-col gap-2">
                <p className="text-ink-dim text-xs">
                  Tap to add / remove. Long-press to update in OSM. Click any space to add a
                  waypoint
                  {vias.length > 0 && <span className="text-ink-dim"> ({vias.length} added)</span>}.
                </p>
                {removed.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-ink-dim text-xs font-semibold">
                      Removed from route ({removed.length})
                    </span>
                    <ul className="flex flex-col gap-1">
                      {removed.map((f) => (
                        <li
                          key={f.id}
                          className="bg-paper-deep flex items-center justify-between rounded-lg px-2 py-1 text-xs"
                        >
                          <span className="text-ink-dim flex items-center gap-1 truncate line-through">
                            {markLabel(f)}
                          </span>
                          <button
                            onClick={() => restoreStop(f.id)}
                            className="text-sky-deep/70 hover:text-sky-deep shrink-0 font-semibold"
                            aria-label="add point back to route"
                          >
                            Add back
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <AnimatePresence initial={false}>
                {stops.length === 0 && (
                  <motion.div
                    key="plan-btn"
                    initial={false}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="border-paper-line flex flex-col gap-2 overflow-hidden border-t pt-4"
                  >
                    <button
                      onClick={makeRoute}
                      disabled={fountains.length === 0 || busy !== null || !sizingReady}
                      className="bg-ink text-paper hover:bg-ink-soft disabled:hover:bg-ink flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold transition disabled:opacity-40"
                    >
                      <PathIcon size={16} />
                      {busy === "route" ? "Planning…" : "Plan route"}
                    </button>
                    {fountains.length > 0 && !sizingReady && planHint && (
                      <p className="text-ink-dim text-center text-xs">{planHint}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {stops.length > 0 && (
                <div className="border-sky-deep/30 bg-sky/10 rounded-2xl border p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink font-semibold">
                      {stops.length} stops
                      <span className="text-ink-dim ml-1 font-normal">of {fountains.length}</span>
                    </span>
                    <span className="text-sky-deep font-semibold">{fmtDist(distanceM)}</span>
                  </div>
                  {autoCount > 0 && (
                    <p className="text-ink-dim mt-1 text-xs">
                      +{autoCount} grabbed for a small detour off your route. Remove any you
                      don&apos;t want.
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    {stops.length > 1 && (
                      <button
                        onClick={reverseRoute}
                        disabled={busy !== null}
                        className="border-sky-deep/40 text-sky-deep hover:bg-sky/10 flex flex-1 items-center justify-center gap-2 rounded-full border py-2.5 text-sm font-semibold transition disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        <ArrowsLeftRightIcon size={16} />
                        {busy === "reverse" ? "Reversing…" : "Direction"}
                      </button>
                    )}
                    <button
                      onClick={startRun}
                      disabled={busy !== null}
                      className="bg-ink text-paper hover:bg-ink-soft flex-1 rounded-full py-2.5 font-bold transition disabled:opacity-40"
                    >
                      Start run →
                    </button>
                  </div>
                </div>
              )}

              {editCount > 0 && (
                <div className="flex flex-col gap-2">
                  {/* Offline-first review: what reached OSM + retry missed sends. */}
                  <SyncStatus tone="light" />
                  {outboxChangeset && (
                    <button
                      onClick={closeEdits}
                      disabled={closingEdits || outboxUnsent > 0}
                      className="border-paper-line text-ink-dim hover:border-sky-deep/60 hover:text-sky-deep w-full rounded-full border py-1.5 text-xs font-semibold transition disabled:opacity-40"
                    >
                      {closingEdits ? "Closing changeset…" : "Close changeset"}
                    </button>
                  )}
                </div>
              )}

              {err && (
                <div className="flex flex-col gap-1 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">
                  <span>{err}</span>
                  {islandPt && (
                    <span className="text-xs text-red-300/80">
                      It&apos;s marked <span className="font-bold">!</span> in red on the map.
                      Remove that point (or move your nearest waypoint), then the route re-plans on
                      its own.
                    </span>
                  )}
                  {errRetryable && (
                    <button
                      type="button"
                      onClick={findPoints}
                      disabled={busy === "find"}
                      className="self-start rounded-md border border-red-500/40 px-2 py-1 text-xs font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {busy === "find" ? "Trying…" : "Try again"}
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {/* ----- RUN PHASE: same map, side panel becomes the live survey ----- */}
      {phase === "run" && (
        <div className="phase-card z-[1000] flex justify-center p-4 md:absolute md:inset-y-0 md:right-0 md:left-auto md:items-center md:p-6">
          <section className="flex w-full max-w-sm flex-col gap-4 md:max-h-[calc(100vh-7rem)] md:overflow-y-auto">
            {session.done ? (
              <RunComplete session={session} tone="light" onExit={exitRun} />
            ) : (
              <RunGuide session={session} tone="light" />
            )}
          </section>
        </div>
      )}
    </main>
  );
}
