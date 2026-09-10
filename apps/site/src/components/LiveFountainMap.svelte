<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import MapView, { type MapMarker, type MapViewState } from "@/components/MapView.svelte";
  import { BUCKET_COLOR, bucketOf } from "@/lib/freshness";
  import FountainPopup from "@/components/fountains/FountainPopup.svelte";
  import SearchProgress, { type LoadingStep } from "@/components/fountains/SearchProgress.svelte";
  import NearMeButton, { type LocateState } from "@/components/fountains/NearMeButton.svelte";
  import SearchAreaPill from "@/components/fountains/SearchAreaPill.svelte";
  import FilterPills from "@/components/fountains/FilterPills.svelte";
  import RoutePanel, { type RouteState } from "@/components/fountains/RoutePanel.svelte";
  import FreshnessLegend from "@/components/FreshnessLegend.svelte";
  import GlassCard from "@/components/GlassCard.svelte";
  import ErrorNotice from "@/components/ErrorNotice.svelte";
  import type { Fountain } from "@rosm/core/schemas";
  import type { FootRoute } from "@rosm/core/brouter";
  import {
    applyHide,
    hideCounts,
    isOutOfService,
    toggled,
    type HideKey,
  } from "@rosm/core/fountainFilters";
  import {
    boundsCenter,
    boundsRadiusM,
    haversine,
    MAX_SEARCH_RADIUS_M,
    walkMinutes,
    type Bounds,
    type Pt,
  } from "@rosm/core/geo";
  import { movedEnough, type Search } from "@rosm/core/requery";
  import { decodeMapHash, encodeMapHash, type MapHashFountain } from "@rosm/core/mapHash";
  import { detectMapsPlatform, walkingDirectionsUrl } from "@rosm/core/mapsDeepLink";
  import { apiFetch, ApiTimeoutError } from "@/lib/api";
  import { queryGeoPermission, type GeoPermission } from "@/lib/geoPermission";

  // The live fountain map: queries Overpass for every amenity=drinking_water
  // node in a viewport, colors each by how recently it was verified, and gets
  // the visitor from "there's one" to "I'm walking to it".
  //
  // Read-only towards OSM. The moving parts are the visitor's location (through
  // MapView's locate control, never `navigator.geolocation` directly), the
  // search footprint (re-queried on request once the map drifts), the selected
  // fountain (routed to, and mirrored into the URL fragment so the page is its
  // own share link), and two hide filters.
  let { class: className = "" }: { class?: string } = $props();

  // Hard client-side ceilings. The backend keeps trying Overpass mirrors and
  // BRouter well past these; the visitor shouldn't wait longer.
  const FETCH_TIMEOUT_MS = 20_000;
  const ROUTE_TIMEOUT_MS = 15_000;

  const DC_CENTER: [number, number] = [38.8972, -77.0369];
  const TAG = { key: "amenity", value: "drinking_water" } as const;

  // A fountain opened from a link lands at street level, and the query that
  // looks for it when it isn't already loaded reaches a short walk around it.
  const FOCUS_ZOOM = 16;
  const FOCUS_RADIUS_M = 1500;
  // A linked fountain already on screen at this zoom or closer keeps the
  // sharer's framing; further out it would be one dot among hundreds.
  const FOCUS_KEEP_ZOOM = 14;

  // The fix landed exactly where the camera already is: the locate control's
  // fit finished synchronously (reduced motion), so there's no move to wait for.
  const SETTLED_M = 25;

  // ---------------------------------------------------------------------------
  // Viewport, hash, and the opening frame

  // The fragment as the page opened. Read once: it decides where the map
  // starts (`v`) and which fountain to open (`f`), after which the fragment is
  // written by this component, not read.
  const initialHash = decodeMapHash(location.hash);
  // The camera belongs to the link, not to auto-locate, when either is set.
  const hashCamera = initialHash.view != null || initialHash.fountain != null;

  // Narrow viewports get a further-out default frame.
  const mobile = new MediaQuery("(max-width: 640px)");
  const openingCenter: [number, number] = initialHash.view
    ? [initialHash.view.lat, initialHash.view.lon]
    : DC_CENTER;
  const openingZoom = $derived(initialHash.view?.zoom ?? (mobile.current ? 7.8 : 11.3));

  let mapView = $state<ReturnType<typeof MapView>>();
  // The last settled viewport, straight from MapView.
  let view = $state.raw<MapViewState | null>(null);
  // True once the visitor has dragged or zoomed themselves.
  let userMoved = false;
  // Camera requests to MapView; bump `key` to send one.
  let flyTo = $state.raw<{ lat: number; lon: number; zoom?: number; key: string }>();
  let recenterKey = $state("init");

  // ---------------------------------------------------------------------------
  // Fountains and the search that found them

  type ApiBounds = [south: number, west: number, north: number, east: number];
  type Region = { bounds: ApiBounds } | { lat: number; lon: number; radiusM: number };
  // Why a search was made. Only the opening DC frame refits the camera to its
  // results; a search around the visitor, or one they asked for, must leave the
  // camera where it is.
  type Origin = "default" | "user" | "area" | "hash";

  let fountains = $state.raw<Fountain[]>([]);
  let busy = $state(false);
  // The last fetch's error, if any. Rendering is deferred (see `showErr`) so a
  // flash — from navigating away, an unmount, or a superseded load — never
  // reaches the screen.
  let err = $state<string | null>(null);
  // Snapshot of "now" captured at fetch time — keeps freshness bucketing pure.
  let nowMs = $state(0);
  // The most recent request, successful or not: what "try again" re-runs, and
  // the marker that the first query has been issued.
  let lastRequest = $state.raw<{ region: Region; origin: Origin } | null>(null);
  // The footprint of the results on screen — what "Search this area" compares
  // the viewport against.
  let lastSearch = $state.raw<{ search: Search; origin: Origin } | null>(null);
  let showSearchArea = $state(false);
  let tooLarge = $state(false);

  const apiBounds = (b: MapViewState["bounds"]): ApiBounds => [b[0][0], b[0][1], b[1][0], b[1][1]];

  function searchOf(region: Region): Search {
    if ("bounds" in region) {
      // The API takes [s, w, n, e]; the geo helpers take MapLibre's [w, s, e, n].
      const [s, w, n, e] = region.bounds;
      const b: Bounds = [w, s, e, n];
      return { center: boundsCenter(b), radiusM: boundsRadiusM(b) };
    }
    return { center: { lat: region.lat, lon: region.lon }, radiusM: region.radiusM };
  }

  // One in-flight search at a time. A newer request aborts the older one and
  // takes over `busy`; a response from a superseded request is dropped rather
  // than painted over fresher results.
  let searchCtl: AbortController | null = null;
  let searchSeq = 0;

  async function search(region: Region, origin: Origin) {
    searchCtl?.abort();
    const ctl = new AbortController();
    searchCtl = ctl;
    const seq = ++searchSeq;
    lastRequest = { region, origin };
    busy = true;
    err = null;
    showSearchArea = false;
    try {
      const r = await apiFetch(
        "/api/fountains",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...region, tag: TAG, recencyMode: "any", includeDisused: true }),
          signal: ctl.signal,
        },
        { timeoutMs: FETCH_TIMEOUT_MS },
      );
      const j = await r.json();
      if (seq !== searchSeq) return;
      if (!r.ok) {
        const e = j.error;
        throw new Error(
          e?.message || (typeof e === "string" ? e : "") || "Couldn't load fountains.",
        );
      }
      const found = j.fountains as Fountain[];
      nowMs = Date.now();
      fountains = found;
      lastSearch = { search: searchOf(region), origin };
      // A selection that didn't survive the new results is gone, route and all.
      if (selectedId != null && !found.some((f) => f.id === selectedId)) selectedId = null;
      // Refit to the returned points' bounding box — only for the opening frame.
      if (origin === "default") recenterKey = `loaded-${found.length}`;
      resolvePendingFocus();
    } catch (e) {
      // Superseded (aborted or stale): the newer request owns the outcome.
      if (seq !== searchSeq) return;
      // Record whatever went wrong; `showErr` decides if it's worth showing.
      err =
        e instanceof ApiTimeoutError
          ? "The fountain search took too long to respond. Please try again."
          : (e as Error).message;
    } finally {
      if (seq === searchSeq) busy = false;
    }
  }

  // The first query, if none has been issued yet, over whatever is on screen.
  function ensureQueried() {
    if (lastRequest || !view) return;
    search({ bounds: apiBounds(view.bounds) }, hashCamera ? "hash" : "default");
  }

  function onViewChange(v: MapViewState, userInitiated: boolean) {
    view = v;
    if (userInitiated) userMoved = true;

    if (pendingUserSearch) {
      // The locate control's fit just landed: query what the visitor sees.
      pendingUserSearch = false;
      search({ bounds: apiBounds(v.bounds) }, "user");
      return;
    }
    if (!lastRequest) {
      // The opening frame. A returning visitor who already granted location is
      // about to be flown to their street — don't query DC just to throw it
      // away — unless a link fixed the camera, in which case the link's view
      // is what they came for and the fix only decorates it.
      if (permission === "granted" && !hashCamera) return;
      ensureQueried();
      return;
    }
    if (lastSearch) {
      showSearchArea = movedEnough(
        { center: { lat: v.lat, lon: v.lon }, radiusM: v.radiusM },
        lastSearch.search,
      );
      tooLarge = v.radiusM > MAX_SEARCH_RADIUS_M;
    }
  }

  // The map failed before it could report a viewport, so the fountain query
  // never fires. Stop the loader (MapView shows its own error card) instead of
  // spinning forever behind it.
  function onMapError() {
    busy = false;
  }

  // ---------------------------------------------------------------------------
  // Location

  let userPos = $state.raw<Pt | null>(null);
  // Tracks only whether we *have* a fix — route fetches key on this, not on the
  // fix itself, so a walking visitor's GPS ticks don't re-route every second.
  const located = $derived(userPos !== null);
  let locateState = $state<LocateState>("idle");
  let permission = $state<GeoPermission | null>(null);
  let autoLocated = false;
  // Set while a fix is expected that will move the camera; the resulting
  // `moveend` runs the "user" search.
  let pendingUserSearch = false;
  // Set when the fix must *not* move the camera. The locate control always fits
  // to the fix on its first result; this undoes that before a frame paints.
  let keepCamera = false;
  let cameraAtTrigger: MapViewState | null = null;

  onMount(() => {
    // In parallel with the map's own load — resolves long before the map does.
    queryGeoPermission().then((p) => (permission = p));
  });

  // Smart auto-locate: only when the browser already trusts this site with
  // location, and only once. Anyone else gets the button.
  $effect(() => {
    if (!view || permission !== "granted" || autoLocated) return;
    autoLocated = true;
    untrack(() => startLocate("auto"));
  });

  // Who asked for the fix decides what the camera does with it:
  //   auto        — nobody did. Fly there only if the camera is still on the
  //                 untouched opening frame; a link's view or the visitor's own
  //                 panning is theirs to keep.
  //   button      — "Find fountains near me": go.
  //   directions  — the popup's arrow: stay on the fountain; the route fit
  //                 brings the visitor into frame once it arrives.
  function startLocate(intent: "auto" | "button" | "directions") {
    keepCamera = intent === "directions" || (intent === "auto" && (hashCamera || userMoved));
    cameraAtTrigger = view;
    if (!mapView?.locate()) {
      locateState = "unavailable";
      ensureQueried();
      return;
    }
    locateState = "locating";
  }

  function onGeolocate(p: { lat: number; lon: number }) {
    const first = userPos === null;
    userPos = { lat: p.lat, lon: p.lon };
    if (!first) return;
    locateState = "idle";
    if (keepCamera) {
      const back = cameraAtTrigger;
      if (back) flyTo = { lat: back.lat, lon: back.lon, zoom: back.zoom, key: `hold-${searchSeq}` };
      ensureQueried();
      return;
    }
    // The camera is going to the visitor. Query what they'll see once it lands
    // — or right now, if the control's fit already finished.
    if (view && haversine(view, p) < SETTLED_M) search({ bounds: apiBounds(view.bounds) }, "user");
    else pendingUserSearch = true;
  }

  function onLocateError(e: GeolocationPositionError) {
    pendingUserSearch = false;
    locateState = e.code === e.PERMISSION_DENIED ? "denied" : "unavailable";
    // Whatever was waiting on the fix — the opening query included — goes on
    // without it.
    ensureQueried();
  }

  // ---------------------------------------------------------------------------
  // Filters

  let hidden = $state.raw<ReadonlySet<HideKey>>(new Set());
  const visible = $derived(applyHide(fountains, hidden));
  const counts = $derived(hideCounts(fountains));

  function onToggle(key: HideKey) {
    hidden = toggled(hidden, key);
    // Hiding the selected fountain hides its route and panel with it.
    if (selectedFountain && applyHide([selectedFountain], hidden).length === 0) selectedId = null;
  }

  // ---------------------------------------------------------------------------
  // Selection and the walking route to it

  let selectedId = $state<MapMarker["id"] | null>(null);
  const selectedFountain = $derived(fountains.find((f) => f.id === selectedId) ?? null);

  let route = $state.raw<RouteState | null>(null);
  let routeLine = $state.raw<[number, number][] | undefined>();
  // Where BRouter says the route breaks: a point with no walkable connection.
  let islandPt = $state.raw<Pt | null>(null);

  const mapsHref = $derived(
    selectedFountain
      ? walkingDirectionsUrl(
          detectMapsPlatform(navigator.userAgent, navigator.maxTouchPoints),
          selectedFountain,
        )
      : "",
  );

  let routeCtl: AbortController | null = null;
  let routeSeq = 0;

  // The route follows the selection: select a fountain and it's fetched,
  // deselect and it's gone. Keyed on the fountain's *id* and on whether a fix
  // exists, so neither a re-query returning the same fountain nor a GPS tick
  // re-routes.
  $effect(() => {
    const id = selectedFountain?.id;
    const hasFix = located;
    untrack(() => {
      routeCtl?.abort();
      routeSeq++;
      islandPt = null;
      routeLine = undefined;
      const target = selectedFountain;
      if (id == null || !target) {
        route = null;
        return;
      }
      if (!hasFix || !userPos) {
        route = { status: "no-location" };
        return;
      }
      fetchRoute(userPos, target);
    });
  });

  async function fetchRoute(from: Pt, f: Fountain) {
    const ctl = new AbortController();
    routeCtl = ctl;
    const seq = ++routeSeq;
    route = { status: "loading" };
    try {
      const r = await apiFetch(
        "/api/route",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: [from, { lat: f.lat, lon: f.lon }],
            loop: false,
          }),
          signal: ctl.signal,
        },
        { timeoutMs: ROUTE_TIMEOUT_MS },
      );
      const j = await r.json();
      if (seq !== routeSeq) return;
      if (!r.ok) {
        const island = j.island as Pt | undefined;
        islandPt = island ?? null;
        route = {
          status: "error",
          island: island != null,
          message: island
            ? "This fountain sits on a path with no walkable connection. Try Open in Maps."
            : "Couldn't find a walking route. Try Open in Maps.",
        };
        return;
      }
      const { coords, distanceM } = j as FootRoute;
      routeLine = coords.map(([lon, lat]) => [lat, lon]);
      route = { status: "ok", distanceM, minutes: walkMinutes(distanceM) };
      fitRouteIfOffscreen(from, f);
    } catch (e) {
      if (seq !== routeSeq) return;
      route = {
        status: "error",
        island: false,
        message:
          e instanceof ApiTimeoutError
            ? "Finding a route took too long. Try Open in Maps."
            : "Couldn't find a walking route. Try Open in Maps.",
      };
    }
  }

  // A fit for the whole route, but only when one end is off screen. Tapping a
  // dot next to you shouldn't move the map; asking for directions to one
  // across town should show you both ends.
  let fitOverride = $state.raw<[number, number][] | null>(null);
  function fitRouteIfOffscreen(from: Pt, f: Fountain) {
    const v = view;
    if (!v) return;
    const inside = (p: Pt) =>
      p.lat >= v.bounds[0][0] &&
      p.lat <= v.bounds[1][0] &&
      p.lon >= v.bounds[0][1] &&
      p.lon <= v.bounds[1][1];
    if (inside(from) && inside(f)) return;
    fitOverride = [
      [from.lat, from.lon],
      [f.lat, f.lon],
    ];
    recenterKey = `route-${routeSeq}`;
  }

  function onDirections() {
    startLocate("directions");
  }

  // ---------------------------------------------------------------------------
  // A fountain opened from a link

  // The `f=` of the fragment, until it's on screen. Held as state so the hash
  // writer knows to leave the fragment alone while it's unresolved.
  let pendingFocus = $state.raw<MapHashFountain | null>(initialHash.fountain ?? null);
  // Whether the query around the linked fountain has been tried already.
  let focusQueried = false;
  let focusLost = $state(false);

  function resolvePendingFocus() {
    const target = pendingFocus;
    if (!target) return;
    if (fountains.some((f) => f.id === target.id)) {
      pendingFocus = null;
      selectedId = target.id;
      const v = view;
      const onScreen =
        v != null &&
        v.zoom >= FOCUS_KEEP_ZOOM &&
        target.lat >= v.bounds[0][0] &&
        target.lat <= v.bounds[1][0] &&
        target.lon >= v.bounds[0][1] &&
        target.lon <= v.bounds[1][1];
      if (!onScreen) {
        flyTo = { lat: target.lat, lon: target.lon, zoom: FOCUS_ZOOM, key: `focus-${target.id}` };
      }
      return;
    }
    if (!focusQueried) {
      // Not in these results. The link carries the fountain's own coordinates
      // for exactly this: look around it once.
      focusQueried = true;
      search({ lat: target.lat, lon: target.lon, radiusM: FOCUS_RADIUS_M }, "hash");
      return;
    }
    // Twice searched, still absent — deleted from OSM since the link was made.
    pendingFocus = null;
    focusLost = true;
  }

  $effect(() => {
    if (!focusLost) return;
    const t = setTimeout(() => (focusLost = false), 5000);
    return () => clearTimeout(t);
  });

  // ---------------------------------------------------------------------------
  // Fragment: view + selection → URL, and back

  let lastWritten = "";
  $effect(() => {
    const v = view;
    const f = selectedFountain;
    // Nothing to say before the first settle; and while a linked fountain is
    // still being found, rewriting would drop it from the URL mid-resolution.
    if (!v || pendingFocus) return;
    const next = encodeMapHash({
      view: { lat: v.lat, lon: v.lon, zoom: v.zoom },
      fountain: f ? { id: f.id, lat: f.lat, lon: f.lon } : undefined,
    });
    if (next === lastWritten) return;
    lastWritten = next;
    // replaceState: panning must never pile up history entries.
    history.replaceState(null, "", next || location.pathname + location.search);
  });

  // The visitor edited the fragment (or used back/forward across edits).
  function onHashChange() {
    const raw = location.hash;
    if (raw === lastWritten) return;
    const h = decodeMapHash(raw);
    if (h.fountain) {
      pendingFocus = h.fountain;
      focusQueried = false;
      resolvePendingFocus();
    } else {
      selectedId = null;
      if (h.view) flyTo = { ...h.view, key: `hash-${raw}` };
    }
  }

  // ---------------------------------------------------------------------------
  // What the map draws

  const markers = $derived.by<MapMarker[]>(() => {
    const dots: MapMarker[] = visible.map((f) => ({
      id: f.id,
      lat: f.lat,
      lon: f.lon,
      color: BUCKET_COLOR[bucketOf(f.tags, nowMs)],
      dimmed: isOutOfService(f.tags),
      data: { f },
    }));
    if (islandPt) {
      dots.push({
        id: "island",
        lat: islandPt.lat,
        lon: islandPt.lon,
        color: "",
        dimmed: true,
        noPopup: true,
      });
    }
    return dots;
  });

  // Frame the map on the dense core, not every point: drop the farthest ~35%
  // before fitting so the outliers don't zoom the map all the way out. Anchored
  // on the search's own centre so it frames whatever was searched, not DC.
  const denseCore = $derived.by<[number, number][] | undefined>(() => {
    if (visible.length < 2 || !lastSearch) return undefined;
    const anchor = lastSearch.search.center;
    const byDist = visible.map((f) => ({ f, d: haversine(anchor, f) })).sort((a, b) => a.d - b.d);
    const keep = Math.max(2, Math.ceil(byDist.length * 0.65));
    return byDist.slice(0, keep).map(({ f }) => [f.lat, f.lon]);
  });
  const fitPoints = $derived(fitOverride ?? denseCore);
  const fitOptions = $derived(
    fitOverride
      ? { padding: [48, 96] as [number, number], maxZoom: 17, duration: 600 }
      : { padding: [4, 4] as [number, number], maxZoom: mobile.current ? 14 : 18 },
  );

  // Play-by-play for the fetch. Names no place: the opening frame is only
  // DC until the visitor is located, and the copy is read by both.
  const loadingSteps = $derived.by<LoadingStep[]>(() => {
    const where = lastRequest?.origin === "user" ? " around you" : "";
    return [
      { text: "Opening a socket to OpenStreetMap servers…", ms: 5000 },
      { text: `Scanning drinking-water nodes${where}…`, ms: 5000 },
      { text: "Reading check_date tags to grade recency…", ms: 5000 },
    ];
  });

  const loading = $derived(busy && fountains.length === 0);
  const succeeded = $derived(!busy && !err && fountains.length > 0);
  const emptyResults = $derived(!busy && !err && lastSearch != null && fountains.length === 0);

  // Defer showing the error. A genuine failure sits still and crosses the delay;
  // a flash — navigating away, an unmount, or a superseded load — tears down
  // first, so its timer never fires and nothing paints. One rule, no per-cause
  // special cases.
  let showErr = $state(false);
  $effect(() => {
    if (!err || busy) {
      showErr = false;
      return;
    }
    const t = setTimeout(() => (showErr = true), 400);
    return () => clearTimeout(t);
  });
</script>

<svelte:window onhashchange={onHashChange} />

<!-- The bottom map controls (attribution) clear the home indicator too. -->
<div
  class="relative h-full w-full {className}"
  style="--map-ctrl-inset-bottom: env(safe-area-inset-bottom)"
>
  <MapView
    bind:this={mapView}
    bind:selectedId
    class="hero-map"
    center={openingCenter}
    zoom={openingZoom}
    minZoom={7}
    maxZoom={18}
    interactive
    showLocate
    showFullscreen
    centerOnSelect
    {onViewChange}
    onError={onMapError}
    ongeolocate={onGeolocate}
    onlocateError={onLocateError}
    {markers}
    markerRadius={6}
    line={routeLine}
    {fitPoints}
    {fitOptions}
    {flyTo}
    recenterKey={`${recenterKey}-${mobile.current}`}
    {markerPopup}
  />

  <!-- First-load: a spacious, self-narrating loader. On success the bar rushes
       to 100%, then the whole overlay fades away. -->
  <SearchProgress
    active={loading}
    done={succeeded}
    failed={showErr}
    steps={loadingSteps}
    variant="overlay"
  />

  <!-- Fetch failed (and the error outlived the flash window): floating retry card. -->
  {#if showErr && err}
    <div class="absolute top-3 left-3 z-[700] max-w-xs">
      <ErrorNotice
        message={err}
        tone="light"
        onRetry={() => lastRequest && search(lastRequest.region, lastRequest.origin)}
        retrying={busy}
      />
    </div>
  {/if}

  <!-- Top centre: clear of the map's own controls (top-right) and the retry
       card (top-left). -->
  <div
    class="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 *:pointer-events-auto"
  >
    <SearchAreaPill
      visible={showSearchArea && !showErr && lastSearch != null}
      {busy}
      {tooLarge}
      onSearch={() => view && search({ bounds: apiBounds(view.bounds) }, "area")}
    />
  </div>

  <!-- Bottom: the action slot centred, the legend + filters left. Full width so
       nothing here can collide sideways; the attribution "i" keeps the bottom-
       right corner. Clears the home indicator via `safe-bottom-3`. -->
  <div
    class="safe-bottom-3 pointer-events-none absolute inset-x-3 z-10 flex flex-col items-start gap-2"
  >
    <div class="flex w-full flex-col items-center gap-2 *:pointer-events-auto">
      {#if focusLost}
        <GlassCard class="px-4 py-2 text-xs text-neutral-700">
          That fountain isn't on the map anymore.
        </GlassCard>
      {/if}
      {#if emptyResults}
        <GlassCard class="px-4 py-2 text-center text-xs text-neutral-700">
          No fountains mapped in view — zoom out and search this area.
        </GlassCard>
      {/if}
      {#if selectedFountain && route}
        <RoutePanel f={selectedFountain} {route} {mapsHref} onClose={() => (selectedId = null)} />
      {:else if !located}
        <NearMeButton
          state={locateState}
          onLocate={() => startLocate("button")}
          onNoteExpired={() => (locateState = "idle")}
        />
      {/if}
    </div>
    <GlassCard class="pointer-events-auto max-w-[calc(100%-3rem)] px-3 py-2">
      <FreshnessLegend />
      <FilterPills class="mt-1.5" {hidden} {counts} {onToggle} />
    </GlassCard>
  </div>
</div>

{#snippet markerPopup(m: MapMarker)}
  {@const f = (m.data as { f: Fountain }).f}
  <FountainPopup {f} {userPos} {onDirections} />
{/snippet}
