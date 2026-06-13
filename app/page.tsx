"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPinIcon, CrosshairIcon, PathIcon, MagnifyingGlassIcon, FlagIcon, PushPinIcon, XIcon } from "@phosphor-icons/react";
import { planRoute } from "@/lib/plan";
import { fmtDist, milesToMeters, type Pt } from "@/lib/geo";
import type { Fountain } from "@/lib/schemas";
import { useRun, type RunStop } from "@/store/run";
import type { MapMarker } from "@/components/MapView";
import OsmStatusBar from "@/components/OsmStatus";
import PointTypePicker from "@/components/PointTypePicker";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function PlannerPage() {
  const router = useRouter();
  const setPlan = useRun((s) => s.setPlan);

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
      // green numbered = chosen; amber star = pinned (forced); gray = available.
      const color = n ? "#16a34a" : isPinned ? "#f59e0b" : "#9ca3af";
      return {
        id: f.id,
        lat: f.lat,
        lon: f.lon,
        color,
        label: n ? String(n) : isPinned ? "★" : undefined,
        onClick: () => togglePin(f.id),
      };
    });
  }, [fountains, stops, pinnedIds]);

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
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-end gap-3">
        <OsmStatusBar />
      </header>

      <div className="grid gap-4 md:grid-cols-[360px_1fr]">
        <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Start location</label>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center gap-2 rounded border border-neutral-300 px-2">
                <MagnifyingGlassIcon size={16} className="text-neutral-400" />
                <input
                  className="w-full bg-transparent py-2 text-sm outline-none"
                  placeholder="Search address / city"
                  value={addr}
                  onChange={(e) => setAddr(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchAddr()}
                />
              </div>
              <button
                onClick={geolocate}
                title="Use my location"
                className="rounded border border-neutral-300 px-3 hover:bg-neutral-50"
              >
                <CrosshairIcon size={18} />
              </button>
            </div>
            <p className="text-xs text-neutral-400">Or click the map to drop the start point.</p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Add to route</span>
            <div className="flex overflow-hidden rounded border border-neutral-300 text-sm">
              <button
                onClick={() => setClickMode("start")}
                className={`flex-1 py-1.5 ${clickMode === "start" ? "bg-neutral-900 text-white" : "bg-white"}`}
              >
                Set start
              </button>
              <button
                onClick={() => setClickMode("via")}
                disabled={!center}
                className={`flex-1 py-1.5 ${clickMode === "via" ? "bg-violet-600 text-white" : "bg-white"} disabled:opacity-40`}
              >
                Add waypoint
                {vias.length > 0 && (
                  <span className="ml-1 text-xs font-normal opacity-70">{vias.length}</span>
                )}
              </button>
            </div>
            <p className="text-xs text-neutral-400">
              {clickMode === "via"
                ? "Click the map to drop a pass-through waypoint."
                : "Click the map to move the start point."}{" "}
              Click any point marker to pin it as a required stop
              {pinned.length > 0 && (
                <span className="text-neutral-300"> ({pinned.length} pinned)</span>
              )}
              .
            </p>
            {(pinned.length > 0 || vias.length > 0) && (
              <ul className="flex flex-col gap-1">
                {pinned.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded bg-amber-50 px-2 py-1 text-xs"
                  >
                    <span className="flex items-center gap-1 truncate text-amber-700">
                      <PushPinIcon size={12} weight="fill" /> {markLabel(f)}
                    </span>
                    <button
                      onClick={() => togglePin(f.id)}
                      className="shrink-0 text-amber-400 hover:text-amber-700"
                      aria-label="unpin mark"
                    >
                      <XIcon size={14} />
                    </button>
                  </li>
                ))}
                {vias.map((v, i) => (
                  <li
                    key={`via-${i}`}
                    className="flex items-center justify-between rounded bg-violet-50 px-2 py-1 text-xs"
                  >
                    <span className="flex items-center gap-1 text-violet-700">
                      <FlagIcon size={12} /> waypoint {i + 1}: {v.lat.toFixed(4)}, {v.lon.toFixed(4)}
                    </span>
                    <button
                      onClick={() => setVias((arr) => arr.filter((_, j) => j !== i))}
                      className="shrink-0 text-violet-400 hover:text-violet-700"
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
            <label className="text-sm font-medium">Point type</label>
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
                className="rounded border border-neutral-300 px-2 py-2 outline-none"
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
                className="rounded border border-neutral-300 px-2 py-2 outline-none"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
            Loop (finish back at start)
          </label>

          <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
            <button
              onClick={findPoints}
              disabled={!center || busy !== null}
              className="flex items-center justify-center gap-2 rounded bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              <MapPinIcon size={16} />
              {busy === "find" ? "Finding…" : "Find points"}
              {fountains.length > 0 && (
                <span className="ml-1 rounded bg-white/20 px-1.5 text-xs">{fountains.length}</span>
              )}
            </button>
            <button
              onClick={makeRoute}
              disabled={fountains.length === 0 || busy !== null}
              className="flex items-center justify-center gap-2 rounded border border-neutral-900 py-2 text-sm font-medium disabled:opacity-40"
            >
              <PathIcon size={16} />
              {busy === "route" ? "Planning…" : "Plan route"}
            </button>
          </div>

          {stops.length > 0 && (
            <div className="rounded bg-green-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-green-800">
                  {stops.length} stops
                  <span className="ml-1 font-normal text-green-600">of {fountains.length}</span>
                </span>
                <span className="font-medium text-green-800">{fmtDist(distanceM)}</span>
              </div>
              <button
                onClick={startRun}
                className="mt-3 w-full rounded bg-green-600 py-2 font-semibold text-white hover:bg-green-700"
              >
                Start run →
              </button>
            </div>
          )}

          {err && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{err}</p>}
        </section>

        <section className="h-[60vh] overflow-hidden rounded-lg border border-neutral-200 md:h-auto md:min-h-[560px]">
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
  );
}
