"use client";

import {
  Circle,
  MapContainer,
  Polygon,
  Rectangle,
  Marker,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "@maplibre/maplibre-gl-leaflet";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

export type MapMarker = {
  id: number | string;
  lat: number;
  lon: number;
  color: string;
  label?: string;
  // Render at reduced opacity — used for context-only points (e.g. nearby
  // fountains shown during a run that aren't part of the surveyed route).
  dimmed?: boolean;
  onClick?: () => void;
  // Rendered inside a Leaflet popup.
  popup?: ReactNode;
  // When the popup opens. "click" (default) opens it on a normal tap. "contextmenu"
  // opens it on long-press / right-click, leaving a plain tap free for `onClick`
  // (so a tap can toggle route membership without the popup hijacking it).
  popupTrigger?: "click" | "contextmenu";
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
  // recenter), so callers can surface a "search this area" affordance. Only
  // mounted when a handler is supplied.
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

// Colored pin via divIcon — avoids Leaflet's broken default marker assets.
function pin(color: string, label?: string, dimmed?: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="opacity:${dimmed ? 0.4 : 1};background:${color};width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);color:#fff;font-size:11px;font-weight:700;line-height:1;">${label ?? ""}</span></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });
}

// Blue location dot, with an optional Apple/Google-style direction cone that
// fans out toward the heading (null heading = dot only).
function userDot(heading?: number | null) {
  const cone =
    heading == null
      ? ""
      : `<svg width="64" height="64" viewBox="0 0 64 64" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(${heading}deg);">
          <defs><radialGradient id="userCone" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stop-color="#2563eb" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
          </radialGradient></defs>
          <path d="M32 32 L16 4 A30 30 0 0 1 48 4 Z" fill="url(#userCone)"/>
        </svg>`;
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:64px;height:64px;">
      ${cone}
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#2563eb;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb;"></div>
    </div>`,
    iconSize: [64, 64],
    iconAnchor: [32, 32],
  });
}

// One marker. For `popupTrigger: "contextmenu"` we suppress Leaflet's default
// open-popup-on-click (bound by <Popup>) so a tap fires only `onClick`, and open
// the popup on long-press / right-click instead.
function MarkerView({ m }: { m: MapMarker }) {
  const ref = useRef<L.Marker>(null);
  const contextOnly = m.popupTrigger === "contextmenu";
  useEffect(() => {
    const mk = ref.current as (L.Marker & { _openPopup: L.LeafletEventHandlerFn }) | null;
    if (!mk || !m.popup || !contextOnly) return;
    // Leaflet's bindPopup wires `_openPopup` to the marker's click event. Drop it
    // so a tap is free for `onClick`; we re-open on contextmenu (long-press) below.
    mk.off("click", mk._openPopup, mk);
    return () => {
      mk.on("click", mk._openPopup, mk);
    };
  }, [m.popup, contextOnly]);
  return (
    <Marker
      ref={ref}
      position={[m.lat, m.lon]}
      icon={pin(m.color, m.label, m.dimmed)}
      eventHandlers={{
        click: () => m.onClick?.(),
        contextmenu: () => {
          if (contextOnly) ref.current?.openPopup();
        },
      }}
    >
      {m.popup && <Popup>{m.popup}</Popup>}
    </Marker>
  );
}

// Dims everything outside the searched box and outlines it. The dimming is a
// world-spanning polygon with the box punched out as a hole; a Rectangle draws
// the crisp edge. Both are non-interactive so map clicks (drop-a-pin) still
// reach the tiles underneath.
function SearchedMask({ box }: { box: [[number, number], [number, number]] }) {
  // A dedicated SVG renderer with generous padding: Leaflet only paints vector
  // overlays a little beyond the viewport by default, so a fast drag can reveal
  // an un-dimmed edge before the pane re-renders. Padding 4 = the pane extends
  // ~4 viewports past each edge, keeping the dim layer covering the screen
  // throughout any drag. One static polygon, so the extra area is cheap.
  const renderer = useMemo(() => L.svg({ padding: 4 }), []);
  const [[s, w], [n, e]] = box;
  // Web Mercator's pole limit. The true ±90 projects to ±infinity, so the fill
  // path gets enormous pixel coords that browsers clip past their SVG coordinate
  // ceiling — a pan then drags the clipped (undimmed) edge into view. Clamping to
  // the projection's valid latitude keeps every coordinate finite.
  const MAX_LAT = 85.05112878;
  const world: [number, number][] = [
    [-MAX_LAT, -180],
    [MAX_LAT, -180],
    [MAX_LAT, 180],
    [-MAX_LAT, 180],
  ];
  const hole: [number, number][] = [
    [s, w],
    [s, e],
    [n, e],
    [n, w],
  ];
  return (
    <>
      <Polygon
        positions={[world, hole]}
        pathOptions={{ stroke: false, fillColor: "#0f172a", fillOpacity: 0.22, renderer }}
        interactive={false}
      />
      <Rectangle
        bounds={box}
        pathOptions={{ color: "#0f172a", weight: 1.5, opacity: 0.4, fill: false, renderer }}
        interactive={false}
      />
    </>
  );
}

// Drop the "Leaflet" prefix (with flag) from the attribution control, keeping
// only the required OSM credit.
// Vector basemap from OpenFreeMap (fully free, no API key, self-hostable) via the
// maplibre-gl-leaflet bridge, so every existing Leaflet overlay keeps working on
// top. Colors, hidden POI layers, and label choices are all baked into our custom
// style at public/map-style.json (edited in Maputnik); its sources/glyphs/sprite
// still resolve to tiles.openfreemap.org, so nothing else needs hosting.
function VectorBasemap() {
  const map = useMap();
  useEffect(() => {
    const glLayer = (
      L as unknown as {
        maplibreGL: (opts: {
          style: string;
          interactive?: boolean;
          attribution?: string;
        }) => L.Layer;
      }
    ).maplibreGL({
      style: "/map-style.json",
      interactive: false,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &middot; <a href="https://openfreemap.org">OpenFreeMap</a>',
    });
    glLayer.addTo(map);
    return () => {
      map.removeLayer(glLayer);
    };
  }, [map]);
  return null;
}

function StripAttributionPrefix() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl?.setPrefix(false);
  }, [map]);
  return null;
}

function Recenter({
  center,
  recenterKey,
  fitPoints,
  fitOptions,
}: {
  center: [number, number];
  recenterKey?: string;
  fitPoints?: [number, number][];
  fitOptions?: { padding?: [number, number]; maxZoom?: number };
}) {
  const map = useMap();
  useEffect(() => {
    if (fitPoints && fitPoints.length >= 2) {
      map.fitBounds(L.latLngBounds(fitPoints), {
        padding: fitOptions?.padding ?? [60, 60],
        maxZoom: fitOptions?.maxZoom ?? 16,
      });
    } else {
      map.setView(center);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);
  return null;
}

function ClickHandler({
  onMapClick,
  onUserPan,
}: {
  onMapClick?: (lat: number, lon: number) => void;
  onUserPan?: () => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick?.(e.latlng.lat, e.latlng.lng);
    },
    // Only user-initiated drags fire dragstart; programmatic setView does not.
    dragstart() {
      onUserPan?.();
    },
  });
  return null;
}

// Reports the map view (center + a corner-reaching radius) after every settled
// pan/zoom. Tracks whether the move began with a user gesture so a "search this
// area" button only appears when the user themselves moved the map.
function ViewHandler({
  onViewChange,
}: {
  onViewChange: (
    view: {
      lat: number;
      lon: number;
      radiusM: number;
      bounds: [[number, number], [number, number]];
    },
    userInitiated: boolean,
  ) => void;
}) {
  const userMoved = useRef(false);
  const map = useMapEvents({
    dragstart() {
      userMoved.current = true;
    },
    zoomstart() {
      userMoved.current = true;
    },
    moveend() {
      const c = map.getCenter();
      const b = map.getBounds();
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      const radiusM = c.distanceTo(ne);
      const bounds: [[number, number], [number, number]] = [
        [sw.lat, sw.lng],
        [ne.lat, ne.lng],
      ];
      onViewChange({ lat: c.lat, lon: c.lng, radiusM, bounds }, userMoved.current);
      userMoved.current = false;
    },
  });
  return null;
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
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      minZoom={minZoom}
      maxZoom={maxZoom}
      className={className}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={scrollWheelZoom}
      dragging={interactive}
      doubleClickZoom={interactive}
      zoomControl={interactive}
      attributionControl={interactive}
      keyboard={interactive}
      touchZoom={interactive}
    >
      <VectorBasemap />
      <StripAttributionPrefix />
      <Recenter
        center={center}
        recenterKey={recenterKey}
        fitPoints={fitPoints}
        fitOptions={fitOptions}
      />
      <ClickHandler onMapClick={onMapClick} onUserPan={onUserPan} />
      {onViewChange && <ViewHandler onViewChange={onViewChange} />}
      {circle && (
        <Circle
          center={circle.center}
          radius={circle.radiusM}
          pathOptions={{ color: "#0284c7", weight: 1.5, opacity: 0.5, fillOpacity: 0.06 }}
        />
      )}
      {searchedBox && <SearchedMask box={searchedBox} />}
      {line && line.length > 1 && (
        <Polyline positions={line} pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.8 }} />
      )}
      {markers.map((m) => (
        <MarkerView key={m.id} m={m} />
      ))}
      {userPos && <Marker position={userPos} icon={userDot(userHeading)} />}
    </MapContainer>
  );
}
