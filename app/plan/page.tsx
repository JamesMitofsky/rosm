"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

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
  { key: "how", title: "How far do you want to go?", hint: "Tune the search and target distance." },
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
  const [clickMode, setClickMode] = useState<"start" | "via">("start");
  const [recenterKey, setRecenterKey] = useState("init");
  const [addr, setAddr] = useState("");
  const [radiusMi, setRadiusMi] = useState<number | "">(3);
  const [targetMi, setTargetMi] = useState<number | "">(3);
  const [loop, setLoop] = useState(true);
  const [tag, setTag] = useState({ key: "amenity", value: "drinking_water" });

  const [fountains, setFountains] = useState<Fountain[]>([]);
  const [stops, setStops] = useState<Fountain[]>([]);
  const [line, setLine] = useState<[number, number][]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
    if (clickMode === "via" && center) {
      setVias((v) => [...v, { lat, lon }]);
    } else {
      recenter({ lat, lon });
    }
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
    setBusy("find");
    setErr(null);
    setStops([]);
    setLine([]);
    setPinnedIds([]);
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
    setBusy("route");
    setErr(null);
    try {
      const { ordered } = planRoute({
        start: center,
        candidates: fountains,
        vias,
        pinned,
        targetM: milesToMeters(targetMi || 0),
        loop,
      });
      const chosen = ordered.filter((n) => n.fountain).map((n) => n.fountain!);
      if (ordered.length === 0) {
        setErr("No points fit that distance. Increase target distance or add via-points.");
        setBusy(null);
        return;
      }
      setStops(chosen);
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
    <main ref={scope} className="relative h-screen w-screen overflow-hidden bg-ink font-body text-cream">
      {/* Map fills the screen; floating cards sit on top. */}
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

      {/* Top bar: brand + OSM status, floating over the map. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
        <Link
          href="/"
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-ink/80 px-4 py-2 font-display text-lg font-bold tracking-tight backdrop-blur"
        >
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 border-volt" />
          ROSM
        </Link>
        <div className="pointer-events-auto">
          <OsmStatusBar />
        </div>
      </header>

      {/* Follow-me toggle: keep the live GPS point centered as the user moves. */}
      <button
        onClick={toggleFollow}
        title={follow ? "Stop following my location" : "Keep my location centered"}
        aria-pressed={follow}
        className={`absolute right-4 top-20 z-[1000] flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-xl backdrop-blur transition ${
          follow
            ? "border-volt bg-volt text-ink"
            : "border-white/10 bg-ink/85 text-cream hover:border-volt/60 hover:text-volt"
        } md:right-6`}
      >
        <NavigationArrowIcon size={16} weight={follow ? "fill" : "regular"} />
        {follow ? "Following" : "Follow me"}
      </button>

      {/* ----- CONFIG PHASE: one question at a time ----- */}
      {phase === "config" && (
        <div className="phase-card absolute inset-x-0 bottom-0 z-[1000] flex justify-center p-4 md:inset-y-0 md:left-0 md:right-auto md:items-center md:p-6">
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

              {/* Step 3 — distances */}
              {active.key === "how" && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                      Search radius (mi)
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={radiusMi}
                        onChange={(e) =>
                          setRadiusMi(
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        className="rounded-lg border border-white/15 bg-ink/40 px-2 py-2 text-cream outline-none focus:border-volt/60"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Target run (mi)
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={targetMi}
                        onChange={(e) =>
                          setTargetMi(
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        className="rounded-lg border border-white/15 bg-ink/40 px-2 py-2 text-cream outline-none focus:border-volt/60"
                      />
                    </label>
                  </div>
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
          {/* Back to the questions. */}
          <button
            onClick={() => setPhase("config")}
            className="phase-card absolute left-4 top-20 z-[1000] flex items-center gap-1.5 rounded-full border border-white/10 bg-ink/85 px-4 py-2.5 text-sm font-semibold text-cream shadow-xl backdrop-blur transition hover:border-volt/60 hover:text-volt md:left-6"
          >
            <SlidersHorizontalIcon size={16} />
            Edit setup
          </button>

          <div className="phase-card absolute inset-x-0 bottom-0 z-[1000] flex justify-center p-4 md:inset-y-0 md:right-0 md:left-auto md:items-center md:p-6">
            <section className="flex max-h-[calc(100vh-7rem)] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-3xl border border-white/10 bg-ink-soft/95 p-5 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Build the route</h2>
                {fountains.length > 0 && (
                  <span className="rounded-full bg-volt/15 px-2 py-0.5 text-xs font-semibold text-volt">
                    {fountains.length} found
                  </span>
                )}
              </div>

              {/* Map interaction mode */}
              <div className="flex flex-col gap-2">
                <div className="flex overflow-hidden rounded-lg border border-white/15 text-sm">
                  <button
                    onClick={() => setClickMode("start")}
                    className={`flex-1 py-1.5 transition ${clickMode === "start" ? "bg-volt font-semibold text-ink" : "bg-ink/40 text-cream-dim hover:text-cream"}`}
                  >
                    Move start
                  </button>
                  <button
                    onClick={() => setClickMode("via")}
                    disabled={!center}
                    className={`flex-1 py-1.5 transition ${clickMode === "via" ? "bg-violet-500 font-semibold text-white" : "bg-ink/40 text-cream-dim hover:text-cream"} disabled:opacity-40`}
                  >
                    Add waypoint
                    {vias.length > 0 && (
                      <span className="ml-1 text-xs font-normal opacity-70">{vias.length}</span>
                    )}
                  </button>
                </div>
                <p className="text-xs text-cream-dim">
                  {clickMode === "via"
                    ? "Click the map to drop a pass-through waypoint."
                    : "Click the map to move the start point."}{" "}
                  Click any point marker to pin it as a required stop or update it in OSM
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
                  disabled={fountains.length === 0 || busy !== null}
                  className="flex items-center justify-center gap-2 rounded-full bg-volt py-2.5 text-sm font-bold text-ink transition hover:bg-cream disabled:opacity-40 disabled:hover:bg-volt"
                >
                  <PathIcon size={16} />
                  {busy === "route" ? "Planning…" : "Plan route"}
                </button>
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
