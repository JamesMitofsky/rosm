"use client";

import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

export type MapMarker = {
  id: number | string;
  lat: number;
  lon: number;
  color: string;
  label?: string;
  onClick?: () => void;
};

type Props = {
  center: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  // polyline as [lat, lon][]
  line?: [number, number][];
  userPos?: [number, number] | null;
  onMapClick?: (lat: number, lon: number) => void;
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

function userDot() {
  return L.divIcon({
    className: "",
    html: `<div style="background:#2563eb;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function Recenter({ center, recenterKey }: { center: [number, number]; recenterKey?: string }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);
  return null;
}

function ClickHandler({ onMapClick }: { onMapClick?: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapView({
  center,
  zoom = 14,
  markers = [],
  line,
  userPos,
  onMapClick,
  recenterKey,
  className,
}: Props) {
  return (
    <MapContainer center={center} zoom={zoom} className={className} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter center={center} recenterKey={recenterKey} />
      <ClickHandler onMapClick={onMapClick} />
      {line && line.length > 1 && <Polyline positions={line} pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.8 }} />}
      {markers.map((m) => (
        <Marker
          key={m.id}
          position={[m.lat, m.lon]}
          icon={pin(m.color, m.label)}
          eventHandlers={m.onClick ? { click: m.onClick } : undefined}
        />
      ))}
      {userPos && <Marker position={userPos} icon={userDot()} />}
    </MapContainer>
  );
}
