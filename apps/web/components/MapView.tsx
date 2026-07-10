"use client";

import MapGL, {
  Source,
  Layer,
  Marker,
  Popup,
  NavigationControl,
  AttributionControl,
  type MapRef,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  LngLatBoundsLike,
} from "maplibre-gl";

export type MapMarker = {
  id: number | string;
  lat: number;
  lon: number;
  color: string;
  label?: string;
  // Render at reduced opacity — used for context-only points (e.g. nearby
  // fountains shown during a run that aren't part of the surveyed route).
  dimmed?: boolean;
  // Fired when the marker is tapped and it has no popup (e.g. remove a via).
  // Markers WITH a popup open the popup on tap instead; their in-popup buttons
  // carry any actions (route toggle, OSM edits).
  onClick?: () => void;
  // Rendered inside the map popup when the marker is tapped.
  popup?: ReactNode;
};

type Props = {
  center: [number, number];
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  // Disable all pan/zoom interaction (decorative/preview maps).
  interactive?: boolean;
  scrollWheelZoom?: boolean;
  markers?: MapMarker[];
  // polyline as [lat, lon][]
  line?: [number, number][];
  // Radius indicator (e.g. search-area preview) drawn under the markers.
  circle?: { center: [number, number]; radiusM: number };
  // The box covering the last-searched area: everything outside is dimmed and a
  // crisp outline is drawn around it. [[south, west], [north, east]].
  searchedBox?: [[number, number], [number, number]];
  userPos?: [number, number] | null;
  // Compass heading in degrees (0 = north, clockwise). Draws a direction cone.
  userHeading?: number | null;
  onMapClick?: (lat: number, lon: number) => void;
  // Fired when the user drags the map, so callers can drop "follow me" mode.
  onUserPan?: () => void;
  // Fired after any pan/zoom settles, with the current center, a radius (m)
  // reaching the viewport corner — enough to cover everything visible — and the
  // exact viewport bounds ([[south, west], [north, east]]) so callers can draw a
  // searched-area box matching the visible rectangle. The `userInitiated` flag is
  // true only when the move came from a drag/zoom gesture (not a programmatic
  // recenter), so callers can surface a "search this area" affordance. Only wired
  // when a handler is supplied.
  onViewChange?: (
    view: {
      lat: number;
      lon: number;
      radiusM: number;
      bounds: [[number, number], [number, number]];
    },
    userInitiated: boolean,
  ) => void;
  recenterKey?: string; // change to force recenter on `center`
  // When set (>=2 points), the map zooms to fit all points instead of just
  // centering on `center`. Used to keep user + next target both in view.
  fitPoints?: [number, number][];
  // Tuning for the `fitPoints` bounding-box fit. Defaults to a roomy frame.
  fitOptions?: { padding?: [number, number]; maxZoom?: number };
  className?: string;
};

// Lets popup content (e.g. PointPopup) dismiss the popup after an action without
// reaching for a map instance — the popup is a single controlled element here.
const MapPopupContext = createContext<{ close: () => void }>({ close: () => {} });
export function useMapPopup() {
  return useContext(MapPopupContext);
}

const MARKERS_SOURCE = "markers";
const MARKERS_LAYER = "markers-circle";

// GPU circle for every marker: colored fill, white ring, dimmed → half opacity.
// Replaces per-marker DOM pins so hundreds of points stay smooth. Labels (the
// few numbered/starred planner points) ride on top as HTML markers so symbol
// glyphs render from the system font rather than the tile server's font subset.
const markerLayer: CircleLayerSpecification = {
  id: MARKERS_LAYER,
  type: "circle",
  source: MARKERS_SOURCE,
  paint: {
    "circle-radius": 9,
    "circle-color": ["get", "color"],
    "circle-opacity": ["case", ["get", "dimmed"], 0.45, 1],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#fff",
    "circle-stroke-opacity": ["case", ["get", "dimmed"], 0.45, 1],
  },
};

const lineLayer: LineLayerSpecification = {
  id: "route-line",
  type: "line",
  source: "route",
  layout: { "line-cap": "round", "line-join": "round" },
  paint: { "line-color": "#2563eb", "line-width": 5, "line-opacity": 0.8 },
};

const circleFillLayer: FillLayerSpecification = {
  id: "search-circle-fill",
  type: "fill",
  source: "search-circle",
  paint: { "fill-color": "#0284c7", "fill-opacity": 0.06 },
};
const circleLineLayer: LineLayerSpecification = {
  id: "search-circle-line",
  type: "line",
  source: "search-circle",
  paint: { "line-color": "#0284c7", "line-width": 1.5, "line-opacity": 0.5 },
};

const maskFillLayer: FillLayerSpecification = {
  id: "searched-mask-fill",
  type: "fill",
  source: "searched-mask",
  paint: { "fill-color": "#0f172a", "fill-opacity": 0.22 },
};
const maskLineLayer: LineLayerSpecification = {
  id: "searched-mask-line",
  type: "line",
  source: "searched-box",
  paint: { "line-color": "#0f172a", "line-width": 1.5, "line-opacity": 0.4 },
};

const ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OSM</a>';

// Marker set → GeoJSON. `id`s may be strings (search-pin, via-0), so the lookup
// key rides in properties as `mid`; feature.id stays numeric-only.
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

const EARTH_R = 6_371_000;
function destPoint(lat: number, lon: number, distM: number, bearingDeg: number): [number, number] {
  const br = (bearingDeg * Math.PI) / 180;
  const la1 = (lat * Math.PI) / 180;
  const lo1 = (lon * Math.PI) / 180;
  const dr = distM / EARTH_R;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(dr) + Math.cos(la1) * Math.sin(dr) * Math.cos(br));
  const lo2 =
    lo1 +
    Math.atan2(
      Math.sin(br) * Math.sin(dr) * Math.cos(la1),
      Math.cos(dr) - Math.sin(la1) * Math.sin(la2),
    );
  return [(lo2 * 180) / Math.PI, (la2 * 180) / Math.PI];
}

// Geodesic circle ring (lon/lat) approximating a metric radius.
function circleFeature(center: [number, number], radiusM: number): GeoJSON.Feature {
  const [lat, lon] = center;
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) ring.push(destPoint(lat, lon, radiusM, (i * 360) / 64));
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} };
}

// World polygon with the searched box punched out as a hole — dims everything
// outside the box. (Web-mercator lat limit ≈ 85°, so the "world" stops there.)
function maskFeature(box: [[number, number], [number, number]]): GeoJSON.Feature {
  const [[s, w], [n, e]] = box;
  const world: [number, number][] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  const hole: [number, number][] = [
    [w, s],
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [world, hole] },
    properties: {},
  };
}
function boxLineFeature(box: [[number, number], [number, number]]): GeoJSON.Feature {
  const [[s, w], [n, e]] = box;
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [w, s],
        [w, n],
        [e, n],
        [e, s],
        [w, s],
      ],
    },
    properties: {},
  };
}

function boundsOf(pts: [number, number][]): LngLatBoundsLike {
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

// Blue location dot with an optional Apple/Google-style heading cone.
function UserDot({ heading }: { heading?: number | null }) {
  return (
    <div style={{ position: "relative", width: 64, height: 64, pointerEvents: "none" }}>
      {heading != null && (
        <svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `translate(-50%,-50%) rotate(${heading}deg)`,
          }}
        >
          <defs>
            <radialGradient id="userCone" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path d="M32 32 L16 4 A30 30 0 0 1 48 4 Z" fill="url(#userCone)" />
        </svg>
      )}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          background: "#2563eb",
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "3px solid #fff",
          boxShadow: "0 0 0 2px #2563eb",
        }}
      />
    </div>
  );
}

export default function MapView({
  center,
  zoom = 14,
  minZoom,
  maxZoom,
  interactive = true,
  // Defaults to `interactive` so a non-interactive map can't scroll-zoom.
  scrollWheelZoom = interactive,
  markers = [],
  line,
  circle,
  searchedBox,
  userPos,
  userHeading,
  onMapClick,
  onUserPan,
  onViewChange,
  recenterKey,
  fitPoints,
  fitOptions,
  className,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const markerById = useMemo(() => new Map(markers.map((m) => [String(m.id), m])), [markers]);
  const markerData = useMemo(() => markersToFeatures(markers), [markers]);
  const labeled = useMemo(() => markers.filter((m) => m.label), [markers]);
  const lineData = useMemo<GeoJSON.Feature | null>(
    () =>
      line && line.length > 1
        ? {
            type: "Feature",
            geometry: { type: "LineString", coordinates: line.map(([la, lo]) => [lo, la]) },
            properties: {},
          }
        : null,
    [line],
  );
  const circleData = useMemo(
    () => (circle ? circleFeature(circle.center, circle.radiusM) : null),
    [circle],
  );
  const maskData = useMemo(() => (searchedBox ? maskFeature(searchedBox) : null), [searchedBox]);
  const boxData = useMemo(() => (searchedBox ? boxLineFeature(searchedBox) : null), [searchedBox]);

  // The open popup's marker: pulled fresh from the current set so its content
  // (e.g. a planner point's in-route state) stays live. If the marker disappears
  // (filters change), this is undefined and the popup simply stops rendering —
  // no cleanup effect needed; a stale `selected` id is harmless.
  const selectedMarker = selected != null ? markerById.get(selected) : undefined;

  // Recenter / fit on explicit request (recenterKey change or first mount),
  // matching the old imperative Leaflet behavior — never fighting a user pan.
  useEffect(() => {
    const map = mapRef.current;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (feature) {
        const mid = feature.properties?.mid as string | undefined;
        const m = mid != null ? markerById.get(mid) : undefined;
        if (m?.popup) setSelected(mid ?? null);
        else m?.onClick?.();
        return;
      }
      // Empty-map tap: dismiss any popup, then report for drop-a-pin.
      setSelected(null);
      onMapClick?.(e.lngLat.lat, e.lngLat.lng);
    },
    [markerById, onMapClick],
  );

  const handleMoveEnd = useCallback(
    (e: { originalEvent?: unknown }) => {
      if (!onViewChange) return;
      const map = mapRef.current;
      if (!map) return;
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
        !!e.originalEvent,
      );
    },
    [onViewChange],
  );

  const popupCtx = useMemo(() => ({ close: () => setSelected(null) }), []);

  return (
    <div className={className} style={{ position: "relative", height: "100%", width: "100%" }}>
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: center[1], latitude: center[0], zoom }}
        minZoom={minZoom}
        maxZoom={maxZoom}
        mapStyle="/map-style.json"
        style={{ height: "100%", width: "100%" }}
        attributionControl={false}
        interactiveLayerIds={[MARKERS_LAYER]}
        dragPan={interactive}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        scrollZoom={scrollWheelZoom}
        doubleClickZoom={interactive}
        touchZoomRotate={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        onLoad={() => mapRef.current?.getMap().touchZoomRotate.disableRotation()}
        onClick={handleClick}
        onDragStart={() => onUserPan?.()}
        onMoveEnd={handleMoveEnd}
        onMouseEnter={() => {
          const c = mapRef.current?.getMap().getCanvas();
          if (c) c.style.cursor = "pointer";
        }}
        onMouseLeave={() => {
          const c = mapRef.current?.getMap().getCanvas();
          if (c) c.style.cursor = "";
        }}
      >
        <AttributionControl customAttribution={ATTRIBUTION} compact />
        {interactive && <NavigationControl position="top-left" showCompass={false} />}

        {maskData && (
          <Source id="searched-mask" type="geojson" data={maskData}>
            <Layer {...maskFillLayer} />
          </Source>
        )}
        {boxData && (
          <Source id="searched-box" type="geojson" data={boxData}>
            <Layer {...maskLineLayer} />
          </Source>
        )}
        {circleData && (
          <Source id="search-circle" type="geojson" data={circleData}>
            <Layer {...circleFillLayer} />
            <Layer {...circleLineLayer} />
          </Source>
        )}
        {lineData && (
          <Source id="route" type="geojson" data={lineData}>
            <Layer {...lineLayer} />
          </Source>
        )}

        <Source id={MARKERS_SOURCE} type="geojson" data={markerData}>
          <Layer {...markerLayer} />
        </Source>

        {/* Labels for the few numbered/starred points, over the GPU circles. */}
        {labeled.map((m) => (
          <Marker
            key={`label-${m.id}`}
            longitude={m.lon}
            latitude={m.lat}
            anchor="center"
            style={{ pointerEvents: "none" }}
          >
            <span
              style={{
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
                opacity: m.dimmed ? 0.45 : 1,
                textShadow: "0 1px 1px rgba(0,0,0,.35)",
              }}
            >
              {m.label}
            </span>
          </Marker>
        ))}

        {userPos && (
          <Marker longitude={userPos[1]} latitude={userPos[0]} anchor="center">
            <UserDot heading={userHeading} />
          </Marker>
        )}

        {selectedMarker?.popup && (
          <Popup
            longitude={selectedMarker.lon}
            latitude={selectedMarker.lat}
            anchor="bottom"
            offset={14}
            closeOnClick={false}
            closeButton={false}
            maxWidth="none"
            onClose={() => setSelected(null)}
          >
            <MapPopupContext.Provider value={popupCtx}>
              {selectedMarker.popup}
            </MapPopupContext.Provider>
          </Popup>
        )}
      </MapGL>
    </div>
  );
}
