"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPinIcon, CrosshairIcon, PathIcon, MagnifyingGlassIcon, FlagIcon, PushPinIcon, XIcon } from "@phosphor-icons/react";
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

export default function PlannerPage() {
  const router = useRouter();
  const setPlan = useRun((s) => s.setPlan);
  const { status: osm } = useOsmStatus();

  const [center, setCenter] = useState<Pt | null>(null);
  const [vias, setVias] = useState<Pt[]>([]);
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [clickMode, setClickMode] = useState<"start" | "via">("start");
  const [recenterKey, setRecenterKey] = useState("init");
  const [addr, setAddr] = useState("");
  const [radiusMi, setRadiusMi] = useState(3);
  const [targetMi, setTargetMi] = useState(3);
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

  function recenter(p: Pt) {
    setCenter(p);
    setRecenterKey(`${p.lat},${p.lon},${Date.now()}`);
  }

  // Marks the user pins, resolved to fountains and forced into the route.
  const pinned = useMemo(
    () => fountains.filter((f) => pinnedIds.includes(f.id)),
    [fountains, pinnedIds],
  );

  function handleMapClick(lat: number, lon: number) {
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
        body: JSON.stringify({ ...center, radiusM: milesToMeters(radiusMi), tag }),
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
        targetM: milesToMeters(targetMi),
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

  return (
    <div className="min-h-screen bg-ink font-body text-cream">
      <main className="mx-auto flex max-w-6xl flex-col gap-5 p-4 md:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <a href="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-volt" />
              Legwork Maps
            </a>
            <p className="mt-1 text-sm text-cream-dim">
              Map a running route past OSM points and verify them on the ground.
            </p>
          </div>
          <OsmStatusBar />
        </header>

        <div className="grid gap-5 md:grid-cols-[360px_1fr]">
          <section className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-ink-soft p-5">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold">Start location</label>
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
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Add to route</span>
              <div className="flex overflow-hidden rounded-lg border border-white/15 text-sm">
                <button
                  onClick={() => setClickMode("start")}
                  className={`flex-1 py-1.5 transition ${clickMode === "start" ? "bg-volt font-semibold text-ink" : "bg-ink/40 text-cream-dim hover:text-cream"}`}
                >
                  Set start
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
                {pinned.length > 0 && <span className="text-cream-dim"> ({pinned.length} pinned)</span>}
                .
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

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold">Point type</label>
              <PointTypePicker value={tag} onChange={setTag} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Search radius (mi)
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={radiusMi}
                  onChange={(e) => setRadiusMi(Number(e.target.value))}
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
                  onChange={(e) => setTargetMi(Number(e.target.value))}
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

            <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
              <button
                onClick={findPoints}
                disabled={!center || busy !== null}
                className="flex items-center justify-center gap-2 rounded-full bg-volt py-2.5 text-sm font-bold text-ink transition hover:bg-cream disabled:opacity-40 disabled:hover:bg-volt"
              >
                <MapPinIcon size={16} />
                {busy === "find" ? "Finding…" : "Find points"}
                {fountains.length > 0 && (
                  <span className="ml-1 rounded-full bg-ink/20 px-1.5 text-xs">{fountains.length}</span>
                )}
              </button>
              <button
                onClick={makeRoute}
                disabled={fountains.length === 0 || busy !== null}
                className="flex items-center justify-center gap-2 rounded-full border border-volt/40 py-2.5 text-sm font-semibold text-volt transition hover:bg-volt/10 disabled:opacity-40 disabled:hover:bg-transparent"
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

          <section className="h-[60vh] overflow-hidden rounded-3xl border border-white/10 md:h-auto md:min-h-[560px]">
            <MapView
              center={center ? [center.lat, center.lon] : [38.9072, -77.0369]}
              zoom={14}
              recenterKey={recenterKey}
              markers={[...markers, ...viaMarkers, ...startMarker]}
              line={line}
              onMapClick={handleMapClick}
              className="h-full w-full"
            />
          </section>
        </div>
      </main>
    </div>
  );
}
