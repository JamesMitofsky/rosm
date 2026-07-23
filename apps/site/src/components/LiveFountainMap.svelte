<script lang="ts">
  import MapView, { type MapMarker } from "@/components/MapView.svelte";
  import { BUCKET_COLOR, bucketOf } from "@/lib/freshness";
  import FountainPopup from "@/components/fountains/FountainPopup.svelte";
  import SearchProgress, { type LoadingStep } from "@/components/fountains/SearchProgress.svelte";
  import ErrorNotice from "@/components/ErrorNotice.svelte";
  import type { Fountain } from "@rosm/core/schemas";
  import { isOutOfService } from "@rosm/core/fountainFilters";
  import { apiFetch } from "@/lib/api";
  import { haversine } from "@rosm/core/geo";

  // Live counterpart to DemoRunMap: on mount it queries Overpass for every
  // amenity=drinking_water node in the on-screen viewport around central DC and
  // colors each by how recently it was verified. Read-only; no editing.
  let { class: className = "" }: { class?: string } = $props();

  const DC_CENTER: [number, number] = [38.8972, -77.0369];
  const CENTER_PT = { lat: DC_CENTER[0], lon: DC_CENTER[1] };
  const TAG = { key: "amenity", value: "drinking_water" } as const;

  // Location-specific play-by-play for the hero fetch.
  const LOADING_STEPS: LoadingStep[] = [
    { text: "Opening a socket to OpenStreetMap servers…", ms: 5000 },
    { text: "Scanning drinking-water nodes around Washington, DC…", ms: 5000 },
    { text: "Reading check_date tags to grade recency…", ms: 5000 },
  ];

  let fountains = $state<Fountain[]>([]);
  let busy = $state(true);
  let err = $state<string | null>(null);
  // Snapshot of "now" captured at fetch time — keeps freshness bucketing pure.
  let nowMs = $state(0);
  // Bumped once the fountains land so MapView refits to their bounding box.
  let recenterKey = $state("init");
  // Narrow viewports get a further-out default frame.
  let isMobile = $state(false);
  $effect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => (isMobile = mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  });

  // The visible viewport rectangle, kept fresh by MapView's onViewChange so the
  // query uses the exact bounding box on screen — no radius.
  let boundsRef: [[number, number], [number, number]] | null = null;

  async function load() {
    const box = boundsRef;
    if (!box) return;
    busy = true;
    err = null;
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
      nowMs = Date.now();
      fountains = found;
      // Refit to the returned points' bounding box.
      recenterKey = `loaded-${found.length}`;
    } catch (e) {
      err = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  // Query once, the first time the map reports a settled viewport (MapView emits
  // this on load, before any movement).
  let didQuery = false;
  function onViewChange(view: { bounds: [[number, number], [number, number]] }) {
    boundsRef = view.bounds;
    if (didQuery) return;
    didQuery = true;
    load();
  }

  const buckets = $derived(fountains.map((f) => ({ f, bucket: bucketOf(f.tags, nowMs) })));

  const markers = $derived<MapMarker[]>(
    buckets.map(({ f, bucket }) => ({
      id: f.id,
      lat: f.lat,
      lon: f.lon,
      color: BUCKET_COLOR[bucket],
      dimmed: isOutOfService(f.tags),
      data: { f },
    })),
  );

  // Frame the map on the dense core, not every point: drop the farthest ~35%
  // before fitting so the outliers don't zoom the map all the way out.
  const fitPoints = $derived.by<[number, number][] | undefined>(() => {
    if (markers.length < 2) return undefined;
    const byDist = markers
      .map((m) => ({ m, d: haversine(CENTER_PT, { lat: m.lat, lon: m.lon }) }))
      .sort((a, b) => a.d - b.d);
    const keep = Math.max(2, Math.ceil(byDist.length * 0.65));
    return byDist.slice(0, keep).map(({ m }) => [m.lat, m.lon]);
  });

  const loading = $derived(busy && fountains.length === 0);
  const succeeded = $derived(!busy && !err && fountains.length > 0);
</script>

<div class="relative h-full w-full {className}">
  <MapView
    class="hero-map"
    center={DC_CENTER}
    zoom={isMobile ? 7.8 : 11.3}
    minZoom={7}
    maxZoom={18}
    interactive
    {onViewChange}
    {markers}
    markerRadius={6}
    {fitPoints}
    fitOptions={{ padding: [4, 4], maxZoom: isMobile ? 14 : 18 }}
    recenterKey={`${recenterKey}-${isMobile}`}
    {markerPopup}
  />

  <!-- First-load: a spacious, self-narrating loader. On success the bar rushes
       to 100%, then the whole overlay fades away. -->
  <SearchProgress
    active={loading}
    done={succeeded}
    failed={!!err}
    steps={LOADING_STEPS}
    variant="overlay"
  />

  <!-- Fetch failed: floating retry card. -->
  {#if err && !busy}
    <div class="absolute top-3 left-3 z-[650] max-w-xs">
      <ErrorNotice message={err} tone="light" onRetry={load} retrying={busy} />
    </div>
  {/if}
</div>

{#snippet markerPopup(m: MapMarker)}
  {@const f = (m.data as { f: Fountain }).f}
  <FountainPopup {f} distM={haversine(CENTER_PT, f)} />
{/snippet}
