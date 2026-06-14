"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  MapPinIcon,
  CrosshairIcon,
  NavigationArrowIcon,
  PathIcon,
  MagnifyingGlassIcon,
  FlagIcon,
  PushPinIcon,
  XIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { planRoute } from "@/lib/plan";
import { fmtDist, milesToMeters, type Pt } from "@/lib/geo";
import type { Fountain, EditAction } from "@/lib/schemas";
import { useRun, type RunStop, type StopStatus } from "@/store/run";
import type { MapMarker } from "@/components/MapView";
import OsmStatusBar, { useOsmStatus } from "@/components/OsmStatus";
import PointTypePicker from "@/components/PointTypePicker";
import PointPopup, { type PointEdit } from "@/components/PointPopup";
import { celebratePoint } from "@/lib/confetti";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

// Snapshot of an in-progress planner route, persisted so a refresh can resume it.
type Draft = {
  center: Pt;
  tag: { key: string; value: string };
  radiusMi: number | "";
  targetMi: number | "";
  loop: boolean;
  fountains: Fountain[];
  pinnedIds: number[];
  vias: Pt[];
  stops: Fountain[];
  line: [number, number][];
  distanceM: number;
  autoCount: number;
};

// Marker colors for points already updated in OSM this session.
const EDIT_COLOR: Partial<Record<StopStatus, string>> = {
  confirm: "#16a34a",
  out_of_order: "#d97706",
  removed: "#dc2626",
  delete: "#dc2626",
};
const EDIT_LABEL: Partial<Record<StopStatus, string>> = {
  confirm: "✓",
  out_of_order: "!",
  removed: "✕",
  delete: "✕",
};

// The guided config steps, answered one at a time before the map takes over.
const STEPS = [
  { key: "where", title: "Where do you start?", hint: "Set the point your run begins from." },
  { key: "what", title: "What are you looking for?", hint: "Pick the kind of point to route past." },
  { key: "radius", title: "How wide should we search?", hint: "Set how far out to look for points." },
] as const;

export default function PlannerPage() {
  const router = useRouter();
  const setPlan = useRun((s) => s.setPlan);
  const { status: osm } = useOsmStatus();

  // "config" walks the questions; "map" hides them and shows only the map.
  const [phase, setPhase] = useState<"config" | "map">("config");
  const [step, setStep] = useState(0);

  const [center, setCenter] = useState<Pt | null>(null);
  // Live GPS position + whether the map keeps it centered as the user moves.
  const [pos, setPos] = useState<Pt | null>(null);
  const [follow, setFollow] = useState(false);
  // Compass heading in degrees (0 = north, clockwise) for the direction cone.
  const [heading, setHeading] = useState<number | null>(null);
  const [vias, setVias] = useState<Pt[]>([]);
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [recenterKey, setRecenterKey] = useState("init");
  const [addr, setAddr] = useState("");
  const [radiusMi, setRadiusMi] = useState<number | "">(3);
  const [targetMi, setTargetMi] = useState<number | "">("");
  // How the route is sized: to a target distance, or purely by the points picked.
  // Default to points so the route is sized by what the user picks unless they opt
  // into a target distance (matches "empty target distance by default").
  const [sizeMode, setSizeMode] = useState<"distance" | "points">("points");
  const [loop, setLoop] = useState(true);
  const [tag, setTag] = useState({ key: "amenity", value: "drinking_water" });

  const [fountains, setFountains] = useState<Fountain[]>([]);
  const [stops, setStops] = useState<Fountain[]>([]);
  const [line, setLine] = useState<[number, number][]>([]);
  const [distanceM, setDistanceM] = useState(0);
  // How many stops were auto-grabbed (tiny detour off the route), for the summary.
  const [autoCount, setAutoCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Session recovery: a saved route from a previous (interrupted) session, and a
  // gate so we don't persist a draft until the initial load has run.
  const [resumable, setResumable] = useState<Draft | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  // Direct OSM edits made from the map, before any run. Keyed by node id.
  const [edits, setEdits] = useState<Record<number, PointEdit>>({});
  const [editChangesetId, setEditChangesetId] = useState<number | undefined>();
  const [editBusyId, setEditBusyId] = useState<number | null>(null);
  const [closingEdits, setClosingEdits] = useState(false);

  const scope = useRef<HTMLElement>(null);

  // Slide/fade the active question in whenever the step changes.
  useGSAP(
    () => {
      gsap.fromTo(
        ".wizard-step",
        { autoAlpha: 0, x: 24 },
        { autoAlpha: 1, x: 0, duration: 0.4, ease: "power3.out" },
      );
    },
    { dependencies: [step], scope },
  );

  // Animate the floating card when switching between config and map-only views.
  useGSAP(
    () => {
      gsap.fromTo(
        ".phase-card",
        { autoAlpha: 0, y: 20, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out" },
      );
    },
    { dependencies: [phase], scope },
  );

  // Status resolved to logged-out → bounce to the dedicated sign-in page.
  useEffect(() => {
    if (osm && !osm.loggedIn) router.replace("/plan/login");
  }, [osm, router]);

  // On mount, look for a saved route from a prior session. If one exists, offer
  // to resume it rather than restoring silently (the user may want a fresh plan).
  useEffect(() => {
    fetch("/api/draft")
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
      targetMi,
      loop,
      fountains,
      pinnedIds,
      vias,
      stops,
      line,
      distanceM,
      autoCount,
    };
    fetch("/api/draft", {
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
    targetMi,
    loop,
    fountains,
    pinnedIds,
    vias,
    stops,
    line,
    distanceM,
    autoCount,
  ]);

  // Restore a saved route into the planner and jump to the map.
  function resumeDraft() {
    const d = resumable;
    if (!d) return;
    recenter(d.center);
    setTag(d.tag);
    setRadiusMi(d.radiusMi);
    setTargetMi(d.targetMi);
    setLoop(d.loop);
    setFountains(d.fountains);
    setPinnedIds(d.pinnedIds);
    setVias(d.vias);
    setStops(d.stops);
    setLine(d.line);
    setDistanceM(d.distanceM);
    setAutoCount(d.autoCount);
    setResumable(null);
    setPhase("map");
  }

  // Drop the saved route — the user wants to start fresh.
  function dismissDraft() {
    setResumable(null);
    fetch("/api/draft", { method: "DELETE" }).catch(() => {});
  }

  function recenter(p: Pt) {
    setCenter(p);
    setRecenterKey(`${p.lat},${p.lon},${Date.now()}`);
  }

  // While "follow" is on, stream the live GPS position. Cleared when off so we
  // don't hold the geolocation watch open in the background.
  useEffect(() => {
    if (!follow) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lon: p.coords.longitude });
        // GPS heading is only meaningful while moving; use as compass fallback.
        if (p.coords.heading != null && !Number.isNaN(p.coords.heading)) {
          setHeading(p.coords.heading);
        }
      },
      (e) => {
        setErr(`Location: ${e.message}`);
        setFollow(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [follow]);

  // Device compass — works even while standing still, unlike GPS heading.
  useEffect(() => {
    if (!follow) return;
    const handler = (e: DeviceOrientationEvent) => {
      const iosHeading = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      let h: number | null = null;
      if (typeof iosHeading === "number") h = iosHeading; // iOS: clockwise from north
      else if (e.absolute && e.alpha != null) h = 360 - e.alpha; // standard absolute
      if (h != null) setHeading(((h % 360) + 360) % 360);
    };
    const evt = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(evt, handler, true);
    return () => window.removeEventListener(evt, handler, true);
  }, [follow]);

  async function toggleFollow() {
    setErr(null);
    if (follow) {
      setFollow(false);
      setHeading(null);
      return;
    }
    if (!navigator.geolocation) {
      setErr("Geolocation not available on this device.");
      return;
    }
    // iOS 13+ gates the compass behind a permission prompt that needs a gesture.
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DOE?.requestPermission === "function") {
      try {
        await DOE.requestPermission();
      } catch {
        // Compass denied — fall back to GPS heading only.
      }
    }
    setFollow(true);
  }

  // Marks the user pins, resolved to fountains and forced into the route.
  const pinned = useMemo(
    () => fountains.filter((f) => pinnedIds.includes(f.id)),
    [fountains, pinnedIds],
  );

  function handleMapClick(lat: number, lon: number) {
    // Placing a point is manual control; stop auto-following the GPS.
    setFollow(false);
    // The start point can only be set during the first setup step ("where").
    // Later config steps ignore map clicks so the start can't move by accident.
    if (phase === "config") {
      if (step === 0) recenter({ lat, lon });
      return;
    }
    // Map phase: a click drops a pass-through waypoint.
    if (center) setVias((v) => [...v, { lat, lon }]);
  }

  function togglePin(id: number) {
    setPinnedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  // Write a status update straight to OSM from the map, no run required. Edits
  // batch into one changeset (opened by the API on first write).
  async function updatePoint(nodeId: number, action: EditAction) {
    if (!osm?.loggedIn) {
      setErr("Sign in to OSM first.");
      return;
    }
    setEditBusyId(nodeId);
    setErr(null);
    try {
      const r = await fetch("/api/osm/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, action, tagKey: tag.key, changesetId: editChangesetId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.formErrors?.join(", ") || j.error || "edit failed");
      setEditChangesetId(j.changesetId);
      setEdits((e) => ({
        ...e,
        [nodeId]: { status: action as StopStatus, summary: j.summary, changesetUrl: j.changesetUrl },
      }));
      celebratePoint();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setEditBusyId(null);
    }
  }

  // Close the open edit changeset so it's not left dangling on OSM.
  async function closeEdits() {
    if (!editChangesetId) return;
    setClosingEdits(true);
    setErr(null);
    try {
      const r = await fetch("/api/osm/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changesetId: editChangesetId }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "close failed");
      setEditChangesetId(undefined);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setClosingEdits(false);
    }
  }

  const editCount = Object.keys(edits).length;

  function markLabel(f: Fountain) {
    return f.tags.name ?? `mark #${f.id}`;
  }

  function geolocate() {
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => recenter({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (e) => setErr(`Geolocation failed: ${e.message}`),
    );
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
    setStops([]);
    setLine([]);
    setPinnedIds([]);
    setAutoCount(0);
    try {
      const r = await fetch("/api/fountains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...center, radiusM: milesToMeters(radiusMi || 0), tag }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.formErrors?.join(", ") || j.error || "fetch failed");
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

  async function makeRoute() {
    if (!center || fountains.length === 0) return;
    // In points mode the route is sized purely by what the user picks, so the
    // target distance is ignored even if a value is left in the field.
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
    setBusy("route");
    setErr(null);
    try {
      const { ordered, autoIds } = planRoute({
        start: center,
        candidates: fountains,
        vias,
        pinned,
        targetM: milesToMeters(target),
        loop,
      });
      const chosen = ordered.filter((n) => n.fountain).map((n) => n.fountain!);
      if (ordered.length === 0) {
        setErr("No points fit that distance. Increase target distance or add via-points.");
        setBusy(null);
        return;
      }
      setStops(chosen);
      setAutoCount(autoIds.length);
      const points = [center, ...ordered.map((n) => ({ lat: n.lat, lon: n.lon }))];
      const r = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points, loop }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "routing failed");
      setLine((j.coords as [number, number][]).map(([lon, lat]) => [lat, lon]));
      setDistanceM(j.distanceM);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function startRun() {
    if (!center || stops.length === 0) return;
    const runStops: RunStop[] = stops.map((f) => ({ ...f, status: "pending" }));
    const plan = {
      start: center,
      loop,
      tagKey: tag.key,
      stops: runStops,
      vias,
      routeCoords: line.map(([lat, lon]) => [lon, lat] as [number, number]),
      distanceM,
    };
    setPlan(plan);
    await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...plan, index: 0 }),
    });
    // Route promoted to an active run; drop the planner draft so we don't re-offer it.
    fetch("/api/draft", { method: "DELETE" }).catch(() => {});
    router.push("/run");
  }

  const markers: MapMarker[] = useMemo(() => {
    const chosenIds = new Map(stops.map((s, i) => [s.id, i + 1]));
    const pinnedSet = new Set(pinnedIds);
    return fountains.map((f) => {
      const n = chosenIds.get(f.id);
      const isPinned = pinnedSet.has(f.id);
      const edit = edits[f.id];
      // edited (this session) wins; else green numbered = chosen; amber star =
      // pinned (forced); gray = available.
      const color = edit
        ? EDIT_COLOR[edit.status] ?? "#9ca3af"
        : n
          ? "#16a34a"
          : isPinned
            ? "#f59e0b"
            : "#9ca3af";
      const label = edit
        ? EDIT_LABEL[edit.status]
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
        // Click opens a popup to pin or update the point straight in OSM.
        popup: (
          <PointPopup
            fountain={f}
            loggedIn={!!osm?.loggedIn}
            isPinned={isPinned}
            edit={edit}
            busy={editBusyId === f.id}
            onPin={() => togglePin(f.id)}
            onAction={(action) => updatePoint(f.id, action)}
          />
        ),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fountains, stops, pinnedIds, edits, editBusyId, osm?.loggedIn]);

  const startMarker: MapMarker[] = center
    ? [{ id: "start", lat: center.lat, lon: center.lon, color: "#2563eb", label: "S" }]
    : [];

  const viaMarkers: MapMarker[] = vias.map((v, i) => ({
    id: `via-${i}`,
    lat: v.lat,
    lon: v.lon,
    color: "#7c3aed",
    label: "✦",
    onClick: () => setVias((arr) => arr.filter((_, j) => j !== i)),
  }));

  const active = STEPS[step];
  const canAdvance = step === 0 ? !!center : true;

  // Whether the current sizing mode has enough input to plan a route.
  const sizingReady =
    sizeMode === "distance" ? (targetMi || 0) > 0 : pinned.length > 0 || vias.length > 0;
  const planHint =
    sizeMode === "distance"
      ? "Enter a target distance above."
      : "Pin a point or add a waypoint to size your route.";

  // Gate the whole planner behind OSM sign-in — no map until logged in. Once the
  // status resolves to logged-out, send the user to the dedicated sign-in page.
  if (osm === null) {
    return <main className="h-screen w-screen bg-ink" />;
  }
  if (!osm.loggedIn) {
    // Redirect handled by the effect above; render blank while it fires.
    return <main className="h-screen w-screen bg-ink" />;
  }

  // When following, the map view tracks the live GPS point (rounded so we only
  // recenter on real movement); otherwise it tracks the chosen start point.
  const DEFAULT_CENTER: [number, number] = [38.9072, -77.0369];
  const viewCenter: [number, number] =
    follow && pos ? [pos.lat, pos.lon] : center ? [center.lat, center.lon] : DEFAULT_CENTER;
  const viewKey =
    follow && pos ? `follow:${pos.lat.toFixed(4)},${pos.lon.toFixed(4)}` : recenterKey;

  return (
    <main
      ref={scope}
      className="relative flex min-h-screen w-screen flex-col bg-ink font-body text-cream md:block md:h-screen md:overflow-hidden"
    >
      {/* Mobile: map sits at the top with a fixed height and the panel flows below it.
          Desktop (md+): map fills the screen and the cards float on top. */}
      <div className="relative h-[55vh] w-full shrink-0 md:absolute md:inset-0 md:h-full">
        <MapView
          center={viewCenter}
          zoom={14}
          recenterKey={viewKey}
          markers={[...markers, ...viaMarkers, ...startMarker]}
          line={line}
          userPos={pos ? [pos.lat, pos.lon] : null}
          userHeading={follow ? heading : null}
          onMapClick={handleMapClick}
          onUserPan={() => setFollow(false)}
          className="absolute inset-0 h-full w-full"
        />
      </div>

      {/* Top bar: OSM status, floating over the map. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-wrap items-center justify-start gap-3 p-4 md:p-5">
        <div className="pointer-events-auto">
          <OsmStatusBar />
        </div>
      </header>

      {/* Follow-me toggle: keep the live GPS point centered as the user moves. */}
      <button
        onClick={toggleFollow}
        title={follow ? "Stop following my location" : "Keep my location centered"}
        aria-pressed={follow}
        className={`absolute right-4 top-4 z-[1000] flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold shadow-xl backdrop-blur transition ${
          follow
            ? "border-volt bg-volt text-ink"
            : "border-white/10 bg-ink/85 text-cream hover:border-volt/60 hover:text-volt"
        } md:right-6 md:top-5`}
      >
        <NavigationArrowIcon size={14} weight={follow ? "fill" : "regular"} />
        {follow ? "Following" : "Follow me"}
      </button>

      {/* Resume offer: a route from a prior session survived a refresh. */}
      {resumable && (
        <div className="pointer-events-auto absolute left-1/2 top-20 z-[1001] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-3 rounded-2xl border border-volt/40 bg-ink-soft/95 p-4 shadow-2xl backdrop-blur-md md:top-6">
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-sm font-bold text-cream">Resume your route?</span>
            <span className="text-xs text-cream-dim">
              {resumable.stops.length} stops · {fmtDist(resumable.distanceM)} — saved from your last session.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resumeDraft}
              className="flex-1 rounded-full bg-volt py-2 text-sm font-bold text-ink transition hover:bg-cream"
            >
              Resume
            </button>
            <button
              onClick={dismissDraft}
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-cream-dim transition hover:text-cream"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}

      {/* ----- CONFIG PHASE: one question at a time ----- */}
      {phase === "config" && (
        <div className="phase-card z-[1000] flex justify-center p-4 md:absolute md:inset-y-0 md:left-0 md:right-auto md:items-center md:p-6">
          <section className="flex w-full max-w-md flex-col gap-5 rounded-3xl border border-white/10 bg-ink-soft/95 p-6 shadow-2xl backdrop-blur-md">
            {/* Step progress */}
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => (
                <div
                  key={s.key}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-volt" : "bg-white/15"}`}
                />
              ))}
            </div>

            <div className="wizard-step flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-cream-dim">
                  Step {step + 1} of {STEPS.length}
                </span>
                <h2 className="font-display text-2xl font-bold leading-tight">{active.title}</h2>
                <p className="text-sm text-cream-dim">{active.hint}</p>
              </div>

              {/* Step 1 — start location */}
              {active.key === "where" && (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/15 bg-ink/40 px-2 focus-within:border-volt/60">
                      <MagnifyingGlassIcon size={16} className="text-cream-dim" />
                      <input
                        className="w-full bg-transparent py-2 text-sm text-cream placeholder:text-cream-dim outline-none"
                        placeholder="Search address / city"
                        value={addr}
                        onChange={(e) => setAddr(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && searchAddr()}
                      />
                    </div>
                    <button
                      onClick={geolocate}
                      title="Use my location"
                      className="rounded-lg border border-white/15 bg-ink/40 px-3 text-cream transition hover:border-volt/60 hover:text-volt"
                    >
                      <CrosshairIcon size={18} />
                    </button>
                  </div>
                  <p className="text-xs text-cream-dim">Or click the map to drop the start point.</p>
                  {center ? (
                    <p className="flex items-center gap-1.5 rounded-lg bg-volt/10 px-3 py-2 text-xs font-medium text-volt">
                      <MapPinIcon size={14} weight="fill" />
                      Start set · {center.lat.toFixed(4)}, {center.lon.toFixed(4)}
                    </p>
                  ) : (
                    <p className="rounded-lg border border-white/10 bg-ink/40 px-3 py-2 text-xs text-cream-dim">
                      No start point yet — search, locate, or tap the map.
                    </p>
                  )}
                </div>
              )}

              {/* Step 2 — point type */}
              {active.key === "what" && (
                <div className="flex flex-col gap-2">
                  <PointTypePicker value={tag} onChange={setTag} />
                  <p className="text-xs text-cream-dim">
                    Routes pass these points so you can verify them on the ground.
                  </p>
                </div>
              )}

              {/* Step 3 — search radius (defines the pool of points to choose from) */}
              {active.key === "radius" && (
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col gap-1 text-sm">
                    Search radius (mi)
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={radiusMi}
                      onChange={(e) =>
                        setRadiusMi(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="rounded-lg border border-white/15 bg-ink/40 px-2 py-2 text-cream outline-none focus:border-volt/60"
                    />
                  </label>
                  <p className="text-xs text-cream-dim">
                    You&apos;ll size the route — by a target distance or by the points you pick —
                    on the map next.
                  </p>
                </div>
              )}
            </div>

            {err && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">{err}</p>
            )}

            {/* Wizard nav */}
            <div className="flex items-center gap-3 border-t border-white/10 pt-4">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold text-cream-dim transition hover:text-cream disabled:pointer-events-none disabled:opacity-0"
              >
                <ArrowLeftIcon size={16} />
                Back
              </button>
              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                  disabled={!canAdvance}
                  className="ml-auto flex items-center gap-1.5 rounded-full bg-volt px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-cream disabled:opacity-40 disabled:hover:bg-volt"
                >
                  Next
                  <ArrowRightIcon size={16} />
                </button>
              ) : (
                <button
                  onClick={finishConfig}
                  disabled={!center || busy !== null}
                  className="ml-auto flex items-center gap-1.5 rounded-full bg-volt px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-cream disabled:opacity-40 disabled:hover:bg-volt"
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
            <section className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-white/10 bg-ink-soft/95 p-5 shadow-2xl backdrop-blur-md md:max-h-[calc(100vh-7rem)] md:overflow-y-auto">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold">Build the route</h2>
                <button
                  onClick={() => setPhase("config")}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-cream-dim transition hover:border-volt/60 hover:text-volt"
                >
                  <SlidersHorizontalIcon size={14} />
                  Edit setup
                </button>
              </div>
              {fountains.length > 0 && (
                <span className="-mt-2 w-fit rounded-full bg-volt/15 px-2 py-0.5 text-xs font-semibold text-volt">
                  {fountains.length} found
                </span>
              )}

              {/* Route sizing: by a target distance, or by the points picked */}
              <div className="flex flex-col gap-2">
                <div className="flex overflow-hidden rounded-lg border border-white/15 text-sm">
                  <button
                    onClick={() => setSizeMode("distance")}
                    className={`flex-1 py-1.5 transition ${sizeMode === "distance" ? "bg-volt font-semibold text-ink" : "bg-ink/40 text-cream-dim hover:text-cream"}`}
                  >
                    Target distance
                  </button>
                  <button
                    onClick={() => setSizeMode("points")}
                    className={`flex-1 py-1.5 transition ${sizeMode === "points" ? "bg-volt font-semibold text-ink" : "bg-ink/40 text-cream-dim hover:text-cream"}`}
                  >
                    By my points
                  </button>
                </div>
                {sizeMode === "distance" ? (
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
                      className="rounded-lg border border-white/15 bg-ink/40 px-2 py-2 text-cream outline-none focus:border-volt/60"
                    />
                  </label>
                ) : (
                  <p className="text-xs text-cream-dim">
                    Pin points or add waypoints below; we&apos;ll size the route to fit them.
                  </p>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={loop}
                    onChange={(e) => setLoop(e.target.checked)}
                    className="h-4 w-4 accent-volt"
                  />
                  Loop (finish back at start)
                </label>
              </div>

              {/* Map interaction help */}
              <div className="flex flex-col gap-2">
                <p className="text-xs text-cream-dim">
                  Click the map to drop a pass-through waypoint
                  {vias.length > 0 && <span className="text-cream-dim"> ({vias.length} added)</span>}.{" "}
                  To change the start point, use{" "}
                  <span className="font-semibold text-cream">Edit setup</span>. Click any point
                  marker to pin it as a required stop or update it in OSM
                  {pinned.length > 0 && <span className="text-cream-dim"> ({pinned.length} pinned)</span>}.
                </p>
                {(pinned.length > 0 || vias.length > 0) && (
                  <ul className="flex flex-col gap-1">
                    {pinned.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between rounded-lg bg-amber-400/10 px-2 py-1 text-xs"
                      >
                        <span className="flex items-center gap-1 truncate text-amber-300">
                          <PushPinIcon size={12} weight="fill" /> {markLabel(f)}
                        </span>
                        <button
                          onClick={() => togglePin(f.id)}
                          className="shrink-0 text-amber-400/60 hover:text-amber-300"
                          aria-label="unpin mark"
                        >
                          <XIcon size={14} />
                        </button>
                      </li>
                    ))}
                    {vias.map((v, i) => (
                      <li
                        key={`via-${i}`}
                        className="flex items-center justify-between rounded-lg bg-violet-400/10 px-2 py-1 text-xs"
                      >
                        <span className="flex items-center gap-1 text-violet-300">
                          <FlagIcon size={12} /> waypoint {i + 1}: {v.lat.toFixed(4)}, {v.lon.toFixed(4)}
                        </span>
                        <button
                          onClick={() => setVias((arr) => arr.filter((_, j) => j !== i))}
                          className="shrink-0 text-violet-400/60 hover:text-violet-300"
                          aria-label="remove waypoint"
                        >
                          <XIcon size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                <button
                  onClick={findPoints}
                  disabled={!center || busy !== null}
                  className="flex items-center justify-center gap-2 rounded-full border border-volt/40 py-2.5 text-sm font-semibold text-volt transition hover:bg-volt/10 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <MapPinIcon size={16} />
                  {busy === "find" ? "Finding…" : "Re-find points"}
                </button>
                <button
                  onClick={makeRoute}
                  disabled={fountains.length === 0 || busy !== null || !sizingReady}
                  className="flex items-center justify-center gap-2 rounded-full bg-volt py-2.5 text-sm font-bold text-ink transition hover:bg-cream disabled:opacity-40 disabled:hover:bg-volt"
                >
                  <PathIcon size={16} />
                  {busy === "route" ? "Planning…" : "Plan route"}
                </button>
                {fountains.length > 0 && !sizingReady && (
                  <p className="text-center text-xs text-cream-dim">{planHint}</p>
                )}
              </div>

              {stops.length > 0 && (
                <div className="rounded-2xl border border-volt/30 bg-volt/10 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="font-semibold text-cream">
                      {stops.length} stops
                      <span className="ml-1 font-normal text-cream-dim">of {fountains.length}</span>
                    </span>
                    <span className="font-semibold text-volt">{fmtDist(distanceM)}</span>
                  </div>
                  {autoCount > 0 && (
                    <p className="mt-1 text-xs text-cream-dim">
                      +{autoCount} grabbed for a small detour off your route.
                    </p>
                  )}
                  <button
                    onClick={startRun}
                    className="mt-3 w-full rounded-full bg-volt py-2.5 font-bold text-ink transition hover:bg-cream"
                  >
                    Start run →
                  </button>
                </div>
              )}

              {editCount > 0 && (
                <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-3 text-sm">
                  <span className="font-semibold text-green-300">
                    {editCount} point{editCount === 1 ? "" : "s"} updated in OSM
                  </span>
                  {editChangesetId && (
                    <button
                      onClick={closeEdits}
                      disabled={closingEdits}
                      className="mt-2 w-full rounded-full border border-green-500/40 py-1.5 text-xs font-semibold text-green-300 transition hover:bg-green-500/10 disabled:opacity-50"
                    >
                      {closingEdits ? "Closing changeset…" : "Close changeset"}
                    </button>
                  )}
                </div>
              )}

              {err && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">{err}</p>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
