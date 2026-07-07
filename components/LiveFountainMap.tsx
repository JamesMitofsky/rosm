"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import type { MapMarker } from "@/components/MapView";
import { BUCKET_COLOR, type Bucket } from "@/components/FreshnessLegend";
import FountainPopup from "@/components/fountains/FountainPopup";
import ErrorNotice from "@/components/ui/ErrorNotice";
import type { Fountain } from "@/lib/schemas";
import { isOutOfService } from "@/lib/fountainFilters";
import { lastCheckedMs } from "@/lib/checkDate";
import { apiFetch } from "@/lib/api";
import { haversine, milesToMeters } from "@/lib/geo";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

/* ------------------------------------------------------------------ */
/* Live counterpart to DemoRunMap: on mount it queries Overpass for    */
/* every amenity=drinking_water node within 3 mi of central DC and     */
/* colors each by how recently it was verified on the ground — the     */
/* app's whole reason to exist. Read-only; no editing here.            */
/* ------------------------------------------------------------------ */
const DC_CENTER: [number, number] = [38.9072, -77.0369];
const CENTER_PT = { lat: DC_CENTER[0], lon: DC_CENTER[1] };
const RADIUS_MI = 3;
const TAG = { key: "amenity", value: "drinking_water" } as const;

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const FRESH_CUTOFF = 12 * MONTH_MS; // checked within a year
const STALE_CUTOFF = 36 * MONTH_MS; // checked within three years

// Play-by-play of what the Overpass round-trip is actually doing, so the wait
// feels earned. Durations are deliberately uneven (~6s each) so it doesn't tick
// like a metronome; the last line holds until the fetch resolves.
const LOADING_STEPS: { text: string; ms: number }[] = [
  { text: "Opening a socket to OpenStreetMap servers…", ms: 5000 },
  { text: "Scanning nodes within 3 mi of Washington, DC…", ms: 5000 },
  { text: "Reading check_date tags to grade recency…", ms: 5000 },
];
// Wall-clock time (ms) at which each loading step begins — cumulative sum of the
// prior steps' durations. The bar's jumps are pinned to these boundaries so a
// forward hop lands exactly when the text swaps to the next line.
const STEP_STARTS: number[] = LOADING_STEPS.reduce<number[]>((acc, step, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + LOADING_STEPS[i - 1].ms);
  return acc;
}, []);
// Percent each step JUMPS to the instant its text appears. Between boundaries the
// bar only crawls a hair (CRAWL_GAIN), so most forward motion is the jump itself.
const STEP_BASE = [10, 42, 74];
const CRAWL_GAIN = 20;

// Percent complete at `ms` elapsed: jump to the current step's base the moment its
// text shows, then crawl slowly by up to CRAWL_GAIN until the next step jumps. Past
// the last step it creeps toward ~99 asymptotically (100 only on real resolve).
function progressAt(ms: number): number {
  let i = 0;
  while (i < STEP_STARTS.length - 1 && ms >= STEP_STARTS[i + 1]) i += 1;
  const base = STEP_BASE[i];
  const elapsedInStep = ms - STEP_STARTS[i];
  const isLast = i === LOADING_STEPS.length - 1;
  if (isLast) return Math.min(99, base + (99 - base) * (1 - Math.exp(-elapsedInStep / 22000)));
  const dur = LOADING_STEPS[i].ms;
  const t = Math.min(1, elapsedInStep / dur);
  // easeInOut (slow after the jump, quicker mid-phrase, slow into the next jump),
  // blended with a linear term so it never fully stalls at either end.
  const inOut = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const eased = 0.4 * t + 0.6 * inOut;
  return base + CRAWL_GAIN * eased;
}

function bucketOf(tags: Record<string, string>, nowMs: number): Bucket {
  const checked = lastCheckedMs(tags);
  if (checked == null) return "very_stale";
  const age = nowMs - checked;
  if (age <= FRESH_CUTOFF) return "fresh";
  if (age <= STALE_CUTOFF) return "stale";
  return "very_stale";
}

export default function LiveFountainMap({
  className,
  onCountsChange,
}: {
  className?: string;
  // Emits freshness counts once the map has loaded (null while loading/failed),
  // so a parent can render the legend outside the map plate.
  onCountsChange?: (counts: Record<Bucket, number> | null) => void;
}) {
  const [fountains, setFountains] = useState<Fountain[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Snapshot of "now" captured at fetch time — keeps freshness bucketing pure
  // across re-renders (Date.now() may not run during render).
  const [nowMs, setNowMs] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  // Kept mounted until the fill reaches 100% and the overlay fades out — so a
  // fast fetch still lets the bar finish its story instead of vanishing mid-way.
  const [showLoader, setShowLoader] = useState(true);
  // Bumped once the fountains land so MapView refits to their bounding box.
  const [recenterKey, setRecenterKey] = useState("init");

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    setShowLoader(true);
    setProgress(0);
    try {
      const r = await apiFetch("/api/fountains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: CENTER_PT.lat,
          lon: CENTER_PT.lon,
          radiusM: milesToMeters(RADIUS_MI),
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

  useEffect(() => {
    load();
  }, [load]);

  // Bucket every point once, then derive markers + legend counts from it.
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

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { fresh: 0, stale: 0, very_stale: 0 };
    for (const { bucket } of buckets) c[bucket]++;
    return c;
  }, [buckets]);

  const loading = busy && fountains.length === 0;

  // Walk the play-by-play at an uneven cadence while the first fetch runs,
  // holding on the final line until it resolves.
  useEffect(() => {
    if (!loading) return;
    setStepIdx(0);
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (i >= LOADING_STEPS.length - 1) return;
      timer = setTimeout(() => {
        i += 1;
        setStepIdx(i);
        tick();
      }, LOADING_STEPS[i].ms);
    };
    tick();
    return () => clearTimeout(timer);
  }, [loading]);

  // Drive the progress bar off wall-clock elapsed time (not step count) so its
  // uneven surge-and-creep curve is independent of the text rotation.
  useEffect(() => {
    if (!loading) return;
    const start = performance.now();
    let raf = requestAnimationFrame(function loop(t) {
      setProgress(progressAt(t - start));
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  // Fetch resolved: rush the bar from wherever the creep left off up to 100%,
  // then fade the overlay out — the effort "pays off" instead of blinking away.
  const succeeded = !busy && !err && fountains.length > 0;
  useEffect(() => {
    if (!succeeded) return;
    const from = progress;
    const start = performance.now();
    const DUR = 550;
    let raf = requestAnimationFrame(function run(t) {
      const k = Math.min(1, (t - start) / DUR);
      const eased = 1 - Math.pow(1 - k, 3); // easeOutCubic
      setProgress(from + (100 - from) * eased);
      if (k < 1) raf = requestAnimationFrame(run);
    });
    const hide = setTimeout(() => setShowLoader(false), DUR + 260);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hide);
    };
    // Fire once on the success transition; `progress` is intentionally a snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [succeeded]);

  // A failed fetch should reveal the error card, not sit under the loader.
  useEffect(() => {
    if (err) setShowLoader(false);
  }, [err]);

  // Surface counts to the parent so the legend can live above the map plate.
  useEffect(() => {
    onCountsChange?.(succeeded ? counts : null);
  }, [succeeded, counts, onCountsChange]);

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      <MapView
        className="hero-map"
        center={DC_CENTER}
        zoom={15}
        minZoom={12}
        maxZoom={18}
        interactive
        circle={{ center: DC_CENTER, radiusM: milesToMeters(RADIUS_MI) }}
        markers={markers}
        fitPoints={fitPoints}
        fitOptions={{ padding: [4, 4], maxZoom: 18 }}
        recenterKey={recenterKey}
      />

      {/* First-load: a spacious, self-narrating loader. The empty map reads as
          "working", not "broken", and the technical play-by-play earns the wait.
          On success the bar rushes to 100%, then the whole overlay fades away. */}
      <AnimatePresence>
        {showLoader && (
          <motion.div
            initial={false}
            exit={{ opacity: 0, scale: 1.015 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="bg-paper/85 absolute inset-0 z-[650] flex flex-col items-center justify-center gap-8 px-8 text-center backdrop-blur-sm"
          >
            <div className="w-full max-w-md">
              <div className="mb-2 flex justify-end">
                <span className="text-ink-dim font-mono text-xs tabular-nums">
                  {Math.round(progress)}%
                </span>
              </div>
              <div className="bg-ink/10 h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className="bg-sky-deep h-full rounded-full transition-[width] duration-1000 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <div className="flex min-h-[4rem] max-w-md items-start justify-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={stepIdx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="text-ink-dim font-mono text-sm leading-relaxed tracking-tight"
                >
                  {LOADING_STEPS[stepIdx].text}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
