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
  import {
    MapLibre,
    GeoJSONSource,
    CircleLayer,
    LineLayer,
    Marker,
    Popup,
    AttributionControl,
  } from "svelte-maplibre-gl";
  import { setMapPopup } from "@/lib/mapPopup";

  type Props = {
    center: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    interactive?: boolean;
    scrollWheelZoom?: boolean;
    markers?: MapMarker[];
    markerRadius?: number;
    line?: [number, number][];
    userPos?: [number, number] | null;
    userHeading?: number | null;
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
    // Rendered inside the map popup when a marker is tapped, given that marker.
    markerPopup?: Snippet<[MapMarker]>;
  };

  let {
    center,
    zoom = 14,
    minZoom,
    maxZoom,
    interactive = true,
    scrollWheelZoom = interactive,
    markers = [],
    markerRadius = 9,
    line,
    userPos = null,
    userHeading = null,
    onViewChange,
    recenterKey,
    fitPoints,
    fitOptions,
    centerOnSelect = false,
    class: className,
    markerPopup,
  }: Props = $props();

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

  const cone = $derived(userHeading);

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

  let isLoaded = $state(false);

  $effect(() => {
    const timer = setTimeout(() => (isLoaded = true), 2500);
    return () => clearTimeout(timer);
  });

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

  // Center the open popup in the viewport (demo maps opt in via `centerOnSelect`).
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
      mapInst.flyTo({
        center: [m.lon, m.lat],
        offset: [0, offsetY],
        duration: 600,
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
    emitView(false);
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
  class={className}
  style="position: relative; height: 100%; width: 100%; opacity: {isLoaded ? 1 : 0}; transition: opacity 350ms ease-out;"
>
  <MapLibre
    bind:map
    style="/map-style.json"
    inlineStyle="height: 100%; width: 100%;"
    autoloadGlobalCss={false}
    attributionControl={false}
    center={[center[1], center[0]]}
    {zoom}
    {minZoom}
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
    onclick={handleClick}
    onmoveend={(ev) => emitView(!!(ev as { originalEvent?: unknown }).originalEvent)}
  >
    <AttributionControl customAttribution={ATTRIBUTION} compact />

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
          "circle-color": ["get", "color"],
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

    {#if userPos}
      <Marker lnglat={[userPos[1], userPos[0]]}>
        {#snippet content()}
          <div style="position:relative; width:64px; height:64px; pointer-events:none;">
            {#if cone != null}
              <svg
                width="64"
                height="64"
                viewBox="0 0 64 64"
                style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%) rotate({cone}deg);"
              >
                <defs>
                  <radialGradient id="userCone" cx="50%" cy="50%" r="55%">
                    <stop offset="0%" stop-color="#2563eb" stop-opacity="0.55" />
                    <stop offset="100%" stop-color="#2563eb" stop-opacity="0" />
                  </radialGradient>
                </defs>
                <path d="M32 32 L16 4 A30 30 0 0 1 48 4 Z" fill="url(#userCone)" />
              </svg>
            {/if}
            <div
              style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); background:#2563eb; width:16px; height:16px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 0 2px #2563eb;"
            ></div>
          </div>
        {/snippet}
      </Marker>
    {/if}

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
