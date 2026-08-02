<script module lang="ts">
  import type { Snippet } from "svelte";

  export type MapMarker = {
    id: number | string;
    lat: number;
    lon: number;
    color: string;
    label?: string;
    // Render at reduced opacity — used for context-only points.
    dimmed?: boolean;
    // Fired when the marker is tapped and no `markerPopup` is supplied.
    onClick?: () => void;
    // Arbitrary payload the `markerPopup` snippet reads to render its content.
    data?: unknown;
    // Opt a specific marker out of opening a popup even when `markerPopup` is set.
    noPopup?: boolean;
  };

  const MARKERS_SOURCE = "markers";
  const MARKERS_LAYER = "markers-circle";
  const POP_MS = 340;

  const ATTRIBUTION =
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OSM</a>';

  // Marker set → GeoJSON. `id`s may be strings, so the lookup key rides in
  // properties as `mid`; feature.id stays numeric-only.
  function markersToFeatures(markers: MapMarker[]): GeoJSON.FeatureCollection {
    return {
      type: "FeatureCollection",
      features: markers.map((m) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [m.lon, m.lat] },
        properties: { mid: String(m.id), color: m.color, dimmed: !!m.dimmed },
      })),
    };
  }

  function boundsOf(pts: [number, number][]): [[number, number], [number, number]] {
    let minLat = Infinity,
      minLon = Infinity,
      maxLat = -Infinity,
      maxLon = -Infinity;
    for (const [lat, lon] of pts) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
    return [
      [minLon, minLat],
      [maxLon, maxLat],
    ];
  }

  // Web Mercator, matching MapLibre's own projection (512px tiles, north-up, no
  // pitch — every map here disables rotation and pitch). This exists so a view
  // can be measured *without* flying the camera there and reading `getBounds()`
  // back: the opening view has to stay the reference even after the visitor has
  // panned and zoomed away from it.
  const WORLD_TILE_PX = 512;
  const lonToX = (lon: number) => (lon + 180) / 360;
  const latToY = (lat: number) => {
    const rad = (lat * Math.PI) / 180;
    return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
  };
  const xToLon = (x: number) => x * 360 - 180;
  const yToLat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

  /**
   * The ground a `width`×`height` box covers when centred on `center` at `zoom`,
   * optionally grown by `slack` — a fraction of the box added to every side.
   *
   * Returned as MapLibre's `[[west, south], [east, north]]`.
   *
   * The 1px on each axis is not cosmetic: MapLibre's camera constraint responds
   * to a viewport *larger* than its `maxBounds` by zooming in to fit, so bounds
   * computed to land exactly on the viewport edge can tip over that line on a
   * rounding error and quietly nudge the opening zoom.
   */
  function viewportBounds(
    center: [number, number],
    zoom: number,
    width: number,
    height: number,
    slack = 0,
  ): [[number, number], [number, number]] {
    const worldPx = WORLD_TILE_PX * 2 ** zoom;
    const dx = (width * (0.5 + slack) + 1) / worldPx;
    const dy = (height * (0.5 + slack) + 1) / worldPx;
    const x = lonToX(center[1]);
    const y = latToY(center[0]);
    return [
      [xToLon(x - dx), yToLat(Math.min(1, y + dy))],
      [xToLon(x + dx), yToLat(Math.max(0, y - dy))],
    ];
  }

  // Overshoot easing so dots pop past full size then settle — matches the label
  // keyframe in globals.css.
  function easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  }
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import type * as maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import rawMapStyle from "@/lib/basemap/map-style.json";
  import {
    MapLibre,
    GeoJSONSource,
    CircleLayer,
    LineLayer,
    Marker,
    Popup,
    AttributionControl,
    GeolocateControl,
    FullScreenControl,
  } from "svelte-maplibre-gl";
  import { setMapPopup } from "@/lib/mapPopup";

  type Props = {
    center: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    // Pen the camera into the view the map opened on: it can zoom in and pan
    // around inside that view, but never pull back past the opening zoom, and
    // never drag more than a margin past the ground the first frame showed (see
    // `LOCK_SLACK`). Overrides `minZoom`.
    lockToOpeningView?: boolean;
    interactive?: boolean;
    scrollWheelZoom?: boolean;
    // Add MapLibre's GeolocateControl: a "locate me" button that drops a blue
    // dot at the visitor's position, an accuracy halo, and — where the device
    // exposes orientation — a heading cone. MapLibre handles the geolocation
    // and (on iOS) the device-orientation permission prompt on tap.
    showLocate?: boolean;
    // Add MapLibre's FullScreenControl (a fullscreen toggle for the map).
    showFullscreen?: boolean;
    markers?: MapMarker[];
    markerRadius?: number;
    line?: [number, number][];
    onViewChange?: (
      view: {
        lat: number;
        lon: number;
        radiusM: number;
        bounds: [[number, number], [number, number]];
      },
      userInitiated: boolean,
    ) => void;
    recenterKey?: string;
    fitPoints?: [number, number][];
    fitOptions?: { padding?: [number, number]; maxZoom?: number };
    centerOnSelect?: boolean;
    class?: string;
    // Hide the basemap's place-name labels (city/town/suburb/etc). Demo map
    // opts in so the fixed DC region doesn't read as a real, named place.
    hidePlaceLabels?: boolean;
    // Fired on a fatal (pre-load) map failure so callers can stop their own
    // loaders and let the error surface.
    onError?: (err: unknown) => void;
    // Rendered inside the map popup when a marker is tapped, given that marker.
    markerPopup?: Snippet<[MapMarker]>;
  };

  let {
    center,
    zoom = 14,
    minZoom,
    maxZoom,
    lockToOpeningView = false,
    interactive = true,
    scrollWheelZoom = interactive,
    showLocate = false,
    showFullscreen = false,
    markers = [],
    markerRadius = 9,
    line,
    onViewChange,
    recenterKey,
    fitPoints,
    fitOptions,
    centerOnSelect = false,
    class: className,
    hidePlaceLabels = false,
    onError,
    markerPopup,
  }: Props = $props();

  // The style document, bundled rather than fetched.
  //
  // It used to live in `public/` and reach MapLibre as the URL
  // "/map-style.json", which put a 64KB round trip in front of every tile the
  // map would ever request — and that request could not even be issued until
  // the island had downloaded, hydrated and built a map, so it landed at the
  // very end of the page's network graph. Bundled, it is in memory by the time
  // `<MapLibre>` mounts and the first thing the map does is ask for tiles.
  //
  // Cloned per instance because MapLibre takes ownership of the object it is
  // handed and writes to it; two maps on one page (the landing page has two)
  // sharing this import would otherwise share those mutations.
  const mapStyle = structuredClone(rawMapStyle) as maplibregl.StyleSpecification;

  let map = $state<maplibregl.Map | undefined>();
  let selected = $state<string | null>(null);
  // 0 → 1 grow factor for the pop-in.
  let popScale = $state(1);

  // Popup content dismisses itself through this context (was useMapPopup).
  setMapPopup({ close: () => (selected = null) });

  const markerData = $derived(markersToFeatures(markers));
  const markerById = $derived(new Map(markers.map((m) => [String(m.id), m])));
  // Signature of the marker *set* (ids only): recolors keep ids, so the pop-in
  // fires only when points actually appear.
  const markerIdSig = $derived(markers.map((m) => m.id).join("|"));
  const labeled = $derived(markers.filter((m) => m.label));
  const lineData = $derived<GeoJSON.Feature | null>(
    line && line.length > 1
      ? {
          type: "Feature",
          geometry: { type: "LineString", coordinates: line.map(([la, lo]) => [lo, la]) },
          properties: {},
        }
      : null,
  );
  const selectedMarker = $derived(selected != null ? markerById.get(selected) : undefined);

  const radius = $derived(Math.max(0, markerRadius * popScale));
  const strokeW = $derived(Math.max(0, 2 * popScale));

  // Recenter / fit on explicit request (recenterKey change), never fighting a pan.
  function doRecenter() {
    if (!map) return;
    if (fitPoints && fitPoints.length >= 2) {
      const [padX, padY] = fitOptions?.padding ?? [60, 60];
      map.fitBounds(boundsOf(fitPoints), {
        padding: { top: padY, bottom: padY, left: padX, right: padX },
        maxZoom: fitOptions?.maxZoom ?? 16,
        duration: 0,
      });
    } else {
      map.jumpTo({ center: [center[1], center[0]] });
    }
  }

  $effect(() => {
    recenterKey; // track
    if (!map) return;
    untrack(doRecenter);
  });

  // Confine the camera to the opening view (see `lockToOpeningView`).
  //
  // The floor is the opening zoom, and it goes in as a plain prop so MapLibre is
  // built with it — there is no first moment where the map can be pulled back
  // past its own opening frame.
  const zoomFloor = $derived(lockToOpeningView ? zoom : minZoom);

  // The pen is the ground the opening view covers, which needs the container's
  // pixel size, so it can only be measured once the box exists. Held as state
  // and handed to `<MapLibre>` as a prop rather than pushed onto the map by
  // hand: the component already owns `maxBounds` and would overwrite an
  // imperative `setMaxBounds` the next time the prop changed.
  //
  // Measured from the `center`/`zoom` this map was *configured* with — the same
  // pair `frames.ts` pre-rendered the loading frame at — never from where the
  // camera currently sits. That is what makes it safe to re-measure after a
  // resize: reading the live camera instead would pen the visitor into whatever
  // they had panned to at the moment they resized.
  let openingBounds = $state<[[number, number], [number, number]] | undefined>();

  /**
   * How far past the opening view the pen reaches, as a fraction of the box on
   * every side.
   *
   * Not zero, because a pen drawn exactly on the opening view pins the camera
   * completely at the opening zoom — and this map moves the camera itself:
   * `centerOnSelect` brings a tapped marker in so its popup has somewhere to go.
   * With no margin that move is clamped to nothing and a popup on an edge marker
   * opens half outside the frame.
   *
   * Sized so an edge marker's popup lands *within* the frame with air around it,
   * rather than with one side flush against it: centring a marker that started
   * on the edge costs about half the box, and the popup standing above it wants
   * a bit more. Short of the 0.5 that would let the route itself be panned
   * entirely out of view.
   */
  const LOCK_SLACK = 0.4;

  function applyViewLock() {
    if (!lockToOpeningView || !map) {
      openingBounds = undefined;
      return;
    }
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    // A container mid-layout reports 0, which would make a degenerate pen.
    if (!w || !h) return;
    openingBounds = viewportBounds(center, zoom, w, h, LOCK_SLACK);
  }

  $effect(() => {
    lockToOpeningView;
    center;
    zoom;
    if (!isLoaded) return;
    untrack(applyViewLock);
  });

  // `isLoaded` tracks the real map `load` event only. It is never forced true
  // on a timer — a blank/hung map must not masquerade as loaded, or the loader
  // hides over nothing and later errors get swallowed by the post-load gate.
  let isLoaded = $state(false);
  let hasError = $state(false);

  // The element `MapFrame.astro`'s loading overlay listens on. The reveal
  // travels as a bubbling DOM event, so the island and the server-rendered
  // frame share nothing but the DOM — no ids to keep in sync across the Astro
  // boundary, and several maps on one page each clear their own frame.
  let root = $state<HTMLDivElement | undefined>();

  // One-shot: whichever of the paths below gets there first, the frame is told
  // exactly once.
  //
  // What counts as "painted" decides how long the visitor looks at a picture of
  // a map instead of the map, so three things race for it:
  //
  // - `load`, once the style is parsed and the first frame is drawn. The normal
  //   winner and the earliest honest moment — hence the `isStyleLoaded()`
  //   guard, since `load` can fire with the style still resolving.
  // - `idle`, once every tile in view has loaded *and* rendered. Much later,
  //   and only the winner when `load` fired before the style settled.
  // - failure, either an error or the load timeout below. A stale picture is
  //   still better than a loading state that never ends, and the error card
  //   this component renders is *underneath* the overlay.
  let signalledReady = false;
  function signalReady() {
    if (signalledReady) return;
    signalledReady = true;
    // One frame of slack: `load` fires *before* the browser has composited that
    // first frame, so revealing synchronously can dissolve to a blank canvas.
    requestAnimationFrame(() =>
      root?.dispatchEvent(new CustomEvent("rosm:map-ready", { bubbles: true })),
    );
  }

  // Keep the canvas the same size as the box it sits in.
  //
  // MapLibre already watches the container, but not in a way this layout can
  // rely on (`Map._setupResizeObserver`): it *discards its observer's first
  // callback* — so any size the box settles into between construction and that
  // first delivery is never applied — and throttles the rest to 50ms, which the
  // canvas spends overhanging the frame's rounded corners mid-drag. Both show up
  // as a map drawn at the wrong size for its card.
  //
  // Every map on this site is sized in `vw`/percentage units by its caller, so
  // the box moves under the canvas constantly. `resize()` only reads the
  // container rect and re-sizes the drawing buffer; running it per animation
  // frame is cheaper than being wrong for three of them.
  $effect(() => {
    const el = root;
    const m = map;
    if (!el || !m) return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        m.resize();
        // The box just changed how much ground it covers, so the opening-view
        // pen no longer matches it. Re-measure rather than leave a map that has
        // to zoom in to satisfy stale bounds.
        applyViewLock();
      });
    });
    observer.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  // Hard ceiling: MapLibre can sit forever if the tile source (via /api/tiles →
  // OpenFreeMap) stalls without ever firing `load` or `error`. Give up at 20s so
  // the loader can't spin indefinitely — surface the fallback instead.
  const LOAD_TIMEOUT_MS = 20_000;
  $effect(() => {
    if (isLoaded || hasError) return;
    const timer = setTimeout(() => {
      if (!isLoaded) {
        console.error("MapLibre load timeout after", LOAD_TIMEOUT_MS, "ms");
        hasError = true;
        signalReady();
        onError?.(new Error("Map load timed out"));
      }
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  });

  // Defer painting the fallback: a genuine failure persists past the delay,
  // while a flash from tearing the map down during navigation never does — so
  // no error UI blinks on the outgoing page. Same rule the callers use.
  let showError = $state(false);
  $effect(() => {
    if (!hasError) {
      showError = false;
      return;
    }
    const t = setTimeout(() => (showError = true), 400);
    return () => clearTimeout(t);
  });

  // Map/style/tile failures surface here. Flag once so the fallback replaces
  // the loader instead of leaving a stuck spinner or a blank canvas. Only
  // fatal (pre-load) failures trip it — a lone tile 404 on a working map
  // shouldn't wipe the whole view.
  function handleError(ev: maplibregl.ErrorEvent) {
    console.error("MapLibre error", ev.error);
    if (!isLoaded) {
      hasError = true;
      signalReady();
      onError?.(ev.error);
    }
  }

  // Pop new dots in: grow circle-radius 0 → target whenever the marker set
  // changes. Radius is a shader uniform, so this stays smooth for many points.
  $effect(() => {
    markerIdSig; // track
    if (!isLoaded) {
      popScale = 0;
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      popScale = 1;
      return;
    }
    popScale = 0;
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / POP_MS);
      popScale = easeOutBack(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  });

  /**
   * The nearest centre to `[lat, lon]` that keeps the whole viewport inside the
   * pen, at the zoom the map is currently on.
   *
   * Without this, a move toward a centre the pen forbids is corrected by
   * MapLibre *during* the animation — `maxBounds` is enforced every time the
   * transform's centre is set, so the camera travels out toward the requested
   * point and is dragged back frame by frame. Clamping the destination up front
   * gives the animation a centre it can actually reach, so the motion is one
   * continuous move instead of an overshoot and a recovery.
   *
   * A no-op when there is no pen.
   */
  function clampToPen(lat: number, lon: number): [number, number] {
    if (!map || !openingBounds) return [lat, lon];
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const worldPx = WORLD_TILE_PX * 2 ** map.getZoom();
    const halfW = w / 2 / worldPx;
    const halfH = h / 2 / worldPx;
    const [[west, south], [east, north]] = openingBounds;
    // A viewport wider than the pen has no valid range on that axis — the
    // midpoint is the only sensible answer, and it is what MapLibre settles on.
    const clamp = (v: number, lo: number, hi: number) =>
      lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
    return [
      yToLat(clamp(latToY(lat), latToY(north) + halfH, latToY(south) - halfH)),
      xToLon(clamp(lonToX(lon), lonToX(west) + halfW, lonToX(east) - halfW)),
    ];
  }

  // Bring a tapped marker into the frame so its popup has room (demo maps opt in
  // via `centerOnSelect`).
  //
  // `easeTo`, not `flyTo`: flyTo flies an arc that pulls the camera back and in
  // again, which over a couple of hundred pixels is mostly swoop — and under a
  // `minZoom` floor it cannot even perform the pull-back, so it fights its own
  // curve. easeTo just moves.
  $effect(() => {
    selected; // track
    if (!centerOnSelect || !map) return;
    const m = untrack(() => selectedMarker);
    if (!m) return;
    const mapInst = map;
    const raf = requestAnimationFrame(() => {
      const popupEl = mapInst
        .getContainer()
        .querySelector(".maplibregl-popup") as HTMLElement | null;
      const offsetY = popupEl ? 14 + popupEl.offsetHeight / 2 : 0;
      // Sit the camera north of the marker by that much, so the marker lands low
      // in the frame and the popup standing above it has headroom. Worked out
      // here rather than handed to `easeTo` as `offset` because the destination
      // has to be a real centre before it can be clamped against the pen.
      const worldPx = WORLD_TILE_PX * 2 ** mapInst.getZoom();
      const [lat, lon] = untrack(() =>
        clampToPen(yToLat(latToY(m.lat) - offsetY / worldPx), m.lon),
      );
      mapInst.easeTo({
        center: [lon, lat],
        duration: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 600,
        essential: true,
      });
    });
    return () => cancelAnimationFrame(raf);
  });

  function emitView(userInitiated: boolean) {
    if (!onViewChange || !map) return;
    const c = map.getCenter();
    const b = map.getBounds();
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    onViewChange(
      {
        lat: c.lat,
        lon: c.lng,
        radiusM: c.distanceTo(ne),
        bounds: [
          [sw.lat, sw.lng],
          [ne.lat, ne.lng],
        ],
      },
      userInitiated,
    );
  }

  function handleLoad() {
    isLoaded = true;
    map?.touchZoomRotate.disableRotation();
    doRecenter();
    // After `doRecenter`, so the pen is measured around the view the map
    // actually settled on.
    applyViewLock();
    emitView(false);
    const attrEl = map?.getContainer().querySelector('.maplibregl-ctrl-attrib');
    attrEl?.classList.remove('maplibregl-compact-show');
    if (hidePlaceLabels && map) {
      for (const layer of map.getStyle().layers) {
        if (layer.type === "symbol" && "source-layer" in layer && layer["source-layer"] === "place") {
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
      }
    }
    if (map?.isStyleLoaded()) signalReady();
  }

  function handleClick(ev: maplibregl.MapMouseEvent) {
    if (!map) return;
    const feats = map.queryRenderedFeatures(ev.point, { layers: [MARKERS_LAYER] });
    const f = feats[0];
    if (f) {
      const mid = f.properties?.mid as string | undefined;
      const m = mid != null ? markerById.get(mid) : undefined;
      if (m && markerPopup && !m.noPopup) selected = mid ?? null;
      else m?.onClick?.();
      return;
    }
    selected = null;
  }

  function setCursor(v: string) {
    const c = map?.getCanvas();
    if (c) c.style.cursor = v;
  }
</script>

<div
  bind:this={root}
  class="map-view-root {className}"
  style="position: relative; height: 100%; width: 100%;"
>
  {#if showError}
    <div
      style="position: absolute; inset: 0; z-index: 20; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 1.5rem; text-align: center; background: #0E85C6; color: #fff;"
    >
      <svg
        style="width: 2.25rem; height: 2.25rem;"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1.75"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m0 3.75h.008M10.34 3.94l-8.4 14.55A1.5 1.5 0 003.24 21h17.52a1.5 1.5 0 001.3-2.51L13.66 3.94a1.5 1.5 0 00-2.6 0z" />
      </svg>
      <p style="margin: 0; font-weight: 700; font-size: 0.95rem;">Map couldn't load</p>
      <p style="margin: 0; font-size: 0.8rem; opacity: 0.85;">Check your connection and try again.</p>
    </div>
  {/if}
  <!-- Fully opaque throughout, and deliberately not faded in. The map used to
       rise from opacity 0 while a loading panel sat on top of it, which is a
       cross-fade rather than a reveal: for its whole length both layers were
       part transparent, so the map dimmed on its way in instead of simply being
       uncovered. Nothing is lost by leaving it solid — until `MapFrame`'s
       overlay clears, this is hidden behind it — and it keeps a live WebGL
       canvas out of a composited opacity animation. -->
  <MapLibre
    bind:map
    style={mapStyle}
    inlineStyle="height: 100%; width: 100%;"
    autoloadGlobalCss={false}
    attributionControl={false}
    center={[center[1], center[0]]}
    {zoom}
    minZoom={zoomFloor}
    maxBounds={openingBounds}
    {maxZoom}
    dragPan={interactive}
    dragRotate={false}
    pitchWithRotate={false}
    touchPitch={false}
    scrollZoom={scrollWheelZoom}
    doubleClickZoom={interactive}
    touchZoomRotate={interactive}
    boxZoom={interactive}
    keyboard={interactive}
    onload={handleLoad}
    onidle={signalReady}
    onerror={handleError}
    onclick={handleClick}
    onmoveend={(ev) => emitView(!!(ev as { originalEvent?: unknown }).originalEvent)}
  >
    <AttributionControl customAttribution={ATTRIBUTION} compact />

    {#if showFullscreen}
      <FullScreenControl position="top-right" />
    {/if}

    {#if showLocate}
      <GeolocateControl
        position="top-right"
        positionOptions={{ enableHighAccuracy: true }}
        trackUserLocation
        showAccuracyCircle
        showUserLocation
        showUserHeading
      />
    {/if}

    {#if lineData}
      <GeoJSONSource data={lineData}>
        <LineLayer
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": "#2563eb", "line-width": 5, "line-opacity": 0.8 }}
        />
      </GeoJSONSource>
    {/if}

    <GeoJSONSource id={MARKERS_SOURCE} data={markerData}>
      <CircleLayer
        id={MARKERS_LAYER}
        paint={{
          "circle-radius": radius,
          "circle-color": ["case", ["get", "dimmed"], "#9ca3af", ["get", "color"]],
          "circle-opacity": ["case", ["get", "dimmed"], 0.45, 1],
          "circle-stroke-width": strokeW,
          "circle-stroke-color": "#fff",
          "circle-stroke-opacity": ["case", ["get", "dimmed"], 0.45, 1],
        }}
        onmouseenter={() => setCursor("pointer")}
        onmouseleave={() => setCursor("")}
      />
    </GeoJSONSource>

    {#each labeled as m (m.id)}
      <Marker lnglat={[m.lon, m.lat]} style={{ pointerEvents: "none" }}>
        {#snippet content()}
          <span
            class="marker-pop-label"
            style="color:#fff; font-size:11px; font-weight:700; line-height:1; opacity:{m.dimmed
              ? 0.45
              : 1}; text-shadow:0 1px 1px rgba(0,0,0,.35);"
          >
            {m.label}
          </span>
        {/snippet}
      </Marker>
    {/each}

    {#if selectedMarker && markerPopup && !selectedMarker.noPopup}
      <Popup
        lnglat={[selectedMarker.lon, selectedMarker.lat]}
        anchor="bottom"
        offset={14}
        closeOnClick={false}
        closeButton={false}
        maxWidth="none"
        onclose={() => (selected = null)}
      >
        {@render markerPopup(selectedMarker)}
      </Popup>
    {/if}
  </MapLibre>
</div>

<style>
  /* Rounds the map to the corner of the frame it sits in.
     The symptom this exists for: the frame's corners look right for the first
     couple of seconds and then square off. That is not the corner changing —
     it is `MapFrame` removing its loading overlay. The overlay's paper and
     glass are ordinary painted content, they round on their own, and while
     they are up they cover the canvas. What is underneath was never rounded.

     A WebGL canvas is composited on its own layer, and a layer is not clipped
     by an ancestor's `border-radius` + `overflow` — the compositor needs a
     clip it can apply itself. So the rounding is stated twice, on purpose:

     - `clip-path` on this element, which the compositor applies to the whole
       subtree, canvas included. This is the one that does the work.
     - `border-radius` directly on the canvas and its container, as the
       fallback for anything that ignores the first.

     Both read `--map-frame-radius` straight rather than chaining through
     `border-radius: inherit`. A custom property crosses `<astro-island>` and
     any wrapper between here and the canvas; an `inherit` chain silently
     resolves to 0 the moment one link doesn't opt in. The fallback value keeps
     a map used outside a frame square. */
  .map-view-root {
    border-radius: var(--map-frame-radius, 0);
    overflow: hidden;
    clip-path: inset(0 round var(--map-frame-radius, 0));
  }

  .map-view-root :global(.maplibregl-map),
  .map-view-root :global(.maplibregl-canvas-container),
  .map-view-root :global(.maplibregl-canvas) {
    border-radius: var(--map-frame-radius, 0);
  }
</style>
