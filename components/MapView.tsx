"use client";

import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, type ReactNode } from "react";

export type MapMarker = {
  id: number | string;
  lat: number;
  lon: number;
  color: string;
  label?: string;
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
  userPos?: [number, number] | null;
  // Compass heading in degrees (0 = north, clockwise). Draws a direction cone.
  userHeading?: number | null;
  onMapClick?: (lat: number, lon: number) => void;
  // Fired when the user drags the map, so callers can drop "follow me" mode.
  onUserPan?: () => void;
  recenterKey?: string; // change to force recenter on `center`
  className?: string;
};

// Colored pin via divIcon — avoids Leaflet's broken default marker assets.
function pin(color: string, label?: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">
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
      icon={pin(m.color, m.label)}
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

function Recenter({ center, recenterKey }: { center: [number, number]; recenterKey?: string }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
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
  userPos,
  userHeading,
  onMapClick,
  onUserPan,
  recenterKey,
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
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter center={center} recenterKey={recenterKey} />
      <ClickHandler onMapClick={onMapClick} onUserPan={onUserPan} />
      {line && line.length > 1 && <Polyline positions={line} pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.8 }} />}
      {markers.map((m) => (
        <MarkerView key={m.id} m={m} />
      ))}
      {userPos && <Marker position={userPos} icon={userDot(userHeading)} />}
    </MapContainer>
  );
}
