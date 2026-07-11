"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MapMarker } from "@/components/MapView";
import { BUCKET_COLOR, bucketOf } from "@/components/FreshnessLegend";
import FountainPopup from "@/components/fountains/FountainPopup";
import SearchProgress, { type LoadingStep } from "@/components/fountains/SearchProgress";
import ErrorNotice from "@/components/ui/ErrorNotice";
import type { Fountain } from "@/lib/schemas";
import { isOutOfService } from "@/lib/fountainFilters";
import { apiFetch } from "@/lib/api";
import { haversine } from "@/lib/geo";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

/* ------------------------------------------------------------------ */
/* Live counterpart to DemoRunMap: on mount it queries Overpass for    */
/* every amenity=drinking_water node within 3 mi of central DC and     */
/* colors each by how recently it was verified on the ground — the     */
/* app's whole reason to exist. Read-only; no editing here.            */
/* ------------------------------------------------------------------ */
const DC_CENTER: [number, number] = [38.8972, -77.0369];
const CENTER_PT = { lat: DC_CENTER[0], lon: DC_CENTER[1] };
const RADIUS_MI = 3;
const TAG = { key: "amenity", value: "drinking_water" } as const;

// Location-specific play-by-play for the hero fetch; the loader's generic
// default copy doesn't name DC or the 3-mi radius.
const LOADING_STEPS: LoadingStep[] = [
  { text: "Opening a socket to OpenStreetMap servers…", ms: 5000 },
  { text: "Scanning nodes within 3 mi of Washington, DC…", ms: 5000 },
  { text: "Reading check_date tags to grade recency…", ms: 5000 },
];

export default function LiveFountainMap({ className }: { className?: string }) {
  const [fountains, setFountains] = useState<Fountain[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Snapshot of "now" captured at fetch time — keeps freshness bucketing pure
  // across re-renders (Date.now() may not run during render).
  const [nowMs, setNowMs] = useState(0);
  // Bumped once the fountains land so MapView refits to their bounding box.
  const [recenterKey, setRecenterKey] = useState("init");
  // Narrow viewports get a further-out default frame: a small phone screen at
  // the desktop fit zoom shows only a couple of blocks, which reads as "lost".
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // The visible viewport rectangle, kept fresh by MapView's onViewChange so the
  // query (and any retry) uses the exact bounding box on screen — no radius.
  const boundsRef = useRef<[[number, number], [number, number]] | null>(null);

  const load = useCallback(async () => {
    const box = boundsRef.current;
    if (!box) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch("/api/fountains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // [south, west, north, east] — the on-screen bounding box.
          bounds: [box[0][0], box[0][1], box[1][0], box[1][1]],
          tag: TAG,
          recencyMode: "any",
          includeDisused: true,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        const e = j.error;
        throw new Error(
          e?.message || (typeof e === "string" ? e : "") || "Couldn't load fountains.",
        );
      }
      const found = j.fountains as Fountain[];
      setNowMs(Date.now());
      setFountains(found);
      // Refit to the returned points' bounding box.
      setRecenterKey(`loaded-${found.length}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  // Query once, the first time the map reports a settled viewport (MapView emits
  // this on load, before any movement). We wait for it because the query needs
  // the real on-screen bounding box, which only exists after the map mounts.
  const didQuery = useRef(false);
  const onViewChange = useCallback(
    (view: { bounds: [[number, number], [number, number]] }) => {
      boundsRef.current = view.bounds;
      if (didQuery.current) return;
      didQuery.current = true;
      load();
    },
    [load],
  );

  // Bucket every point once, then derive markers from it.
  const buckets = useMemo(
    () => fountains.map((f) => ({ f, bucket: bucketOf(f.tags, nowMs) })),
    [fountains, nowMs],
  );

  const markers: MapMarker[] = useMemo(
    () =>
      buckets.map(({ f, bucket }) => ({
        id: f.id,
        lat: f.lat,
        lon: f.lon,
        color: BUCKET_COLOR[bucket],
        dimmed: isOutOfService(f.tags),
        popup: <FountainPopup f={f} distM={haversine(CENTER_PT, f)} />,
      })),
    [buckets],
  );

  // Frame the map on the dense core, not every point. fitBounds would otherwise
  // zoom out to include the farthest outliers across the whole 3-mi radius,
  // which reads as "barely zoomed" — so drop the farthest ~35% before fitting.
  const fitPoints = useMemo<[number, number][] | undefined>(() => {
    if (markers.length < 2) return undefined;
    const byDist = markers
      .map((m) => ({ m, d: haversine(CENTER_PT, { lat: m.lat, lon: m.lon }) }))
      .sort((a, b) => a.d - b.d);
    const keep = Math.max(2, Math.ceil(byDist.length * 0.65));
    return byDist.slice(0, keep).map(({ m }) => [m.lat, m.lon]);
  }, [markers]);

  const loading = busy && fountains.length === 0;
  const succeeded = !busy && !err && fountains.length > 0;

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      <MapView
        className="hero-map"
        center={DC_CENTER}
        zoom={isMobile ? 8.8 : 12.3}
        minZoom={8}
        maxZoom={18}
        interactive
        onViewChange={onViewChange}
        markers={markers}
        markerRadius={6}
        fitPoints={fitPoints}
        fitOptions={{ padding: [4, 4], maxZoom: isMobile ? 14 : 18 }}
        recenterKey={`${recenterKey}-${isMobile}`}
      />

      {/* First-load: a spacious, self-narrating loader. The empty map reads as
          "working", not "broken", and the technical play-by-play earns the wait.
          On success the bar rushes to 100%, then the whole overlay fades away. */}
      <SearchProgress
        active={loading}
        done={succeeded}
        failed={!!err}
        steps={LOADING_STEPS}
        variant="overlay"
      />

      {/* Fetch failed: floating retry card. */}
      {err && !busy && (
        <div className="absolute top-3 left-3 z-[650] max-w-xs">
          <ErrorNotice message={err} tone="light" onRetry={load} retrying={busy} />
        </div>
      )}

      {/* Loaded: freshness legend now lives above the map plate (rendered by the
          parent via onCountsChange), so nothing overlays the map here. */}
    </div>
  );
}
