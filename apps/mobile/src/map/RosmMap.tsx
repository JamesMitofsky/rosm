import { StyleSheet, type ViewStyle, type NativeSyntheticEvent } from "react-native";
import { Camera, GeoJSONSource, Layer, Map } from "@maplibre/maplibre-react-native";
import type { Feature, FeatureCollection, Point } from "geojson";
import { OSM_STYLE_JSON } from "./style";

// Marker data only — screens attach their own action UI on press (Leaflet-style
// popups can't ride through GeoJSON). Mirrors the web MapView marker shape.
export type RosmMarker = {
  id: number | string;
  lat: number;
  lon: number;
  color: string;
  label?: string;
  dimmed?: boolean;
};

type PressEvent = { lngLat: [number, number] };
type PressEventWithFeatures = { features: Feature[] };
// MapLibre onRegionDidChange payload (subset we use). bounds is [w, s, e, n].
type RegionEvent = {
  center: [number, number]; // [lon, lat]
  zoom: number;
  bounds: [number, number, number, number];
  userInteraction: boolean;
};

// Viewport after the user pans/zooms, in the [lat, lon] convention this map uses.
export type RosmRegion = {
  center: [number, number]; // [lat, lon]
  zoom: number;
  bounds: [number, number, number, number]; // [w, s, e, n]
};

type Props = {
  center: [number, number]; // [lat, lon]
  zoom?: number;
  markers?: RosmMarker[];
  line?: [number, number][]; // [lat, lon][]
  userPos?: [number, number] | null; // [lat, lon]
  onMarkerPress?: (id: RosmMarker["id"]) => void;
  onMapPress?: (lat: number, lon: number) => void;
  // Fires after a user-driven pan/zoom settles (not programmatic camera moves).
  onRegionChange?: (region: RosmRegion) => void;
  // Position the camera once, then leave it under the user's finger. Without this
  // the controlled center/zoom re-applies on every render and snaps panning back.
  initialOnly?: boolean;
  recenterKey?: string;
  fitPoints?: [number, number][]; // [lat, lon][]
  style?: ViewStyle;
};

const markerFeatures = (markers: RosmMarker[]): FeatureCollection<Point> => ({
  type: "FeatureCollection",
  features: markers.map((m): Feature<Point> => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [m.lon, m.lat] },
    properties: {
      mid: String(m.id),
      color: m.color,
      label: m.label ?? "",
      dimmed: m.dimmed ? 1 : 0,
    },
  })),
});

const lineFeature = (line: [number, number][]): Feature => ({
  type: "Feature",
  geometry: { type: "LineString", coordinates: line.map(([lat, lon]) => [lon, lat]) },
  properties: {},
});

const pointFeature = ([lat, lon]: [number, number]): Feature<Point> => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: {},
});

// Center on the fit-points centroid at a modest zoom when a bounding set is given,
// else the explicit center. (A true fitBounds is a later refinement.)
function resolveView(
  center: [number, number],
  zoom: number,
  fitPoints?: [number, number][],
): { center: [number, number]; zoom: number } {
  if (fitPoints && fitPoints.length >= 2) {
    const lat = fitPoints.reduce((s, p) => s + p[0], 0) / fitPoints.length;
    const lon = fitPoints.reduce((s, p) => s + p[1], 0) / fitPoints.length;
    return { center: [lon, lat], zoom: 14 };
  }
  return { center: [center[1], center[0]], zoom };
}

export function RosmMap({
  center,
  zoom = 15,
  markers = [],
  line,
  userPos,
  onMarkerPress,
  onMapPress,
  onRegionChange,
  initialOnly,
  fitPoints,
  style,
}: Props) {
  const view = resolveView(center, zoom, fitPoints);

  const onSourcePress = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const mid = e.nativeEvent.features?.[0]?.properties?.mid;
    if (mid != null) onMarkerPress?.(mid);
  };

  const onMap = (e: NativeSyntheticEvent<PressEvent>) => {
    const [lon, lat] = e.nativeEvent.lngLat;
    onMapPress?.(lat, lon);
  };

  const onRegion = (e: NativeSyntheticEvent<RegionEvent>) => {
    const { center: c, zoom: z, bounds, userInteraction } = e.nativeEvent;
    // Ignore camera-driven settles so a recenter doesn't masquerade as a search.
    if (!userInteraction) return;
    onRegionChange?.({ center: [c[1], c[0]], zoom: z, bounds });
  };

  return (
    <Map
      style={[StyleSheet.absoluteFill, style]}
      mapStyle={OSM_STYLE_JSON}
      onPress={onMap}
      onRegionDidChange={onRegionChange ? onRegion : undefined}
    >
      {initialOnly ? (
        <Camera initialViewState={{ center: view.center, zoom: view.zoom }} />
      ) : (
        <Camera center={view.center} zoom={view.zoom} />
      )}

      {line && line.length > 1 ? (
        <GeoJSONSource id="route" data={lineFeature(line)}>
          <Layer
            id="route-line"
            type="line"
            paint={{ "line-color": "#2563eb", "line-width": 4, "line-opacity": 0.85 }}
          />
        </GeoJSONSource>
      ) : null}

      <GeoJSONSource id="markers" data={markerFeatures(markers)} onPress={onSourcePress}>
        <Layer
          id="marker-dots"
          type="circle"
          paint={{
            "circle-color": ["get", "color"],
            "circle-radius": 9,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
            "circle-opacity": ["case", ["==", ["get", "dimmed"], 1], 0.4, 1],
          }}
        />
        <Layer
          id="marker-labels"
          type="symbol"
          layout={{
            "text-field": ["get", "label"],
            "text-size": 11,
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          }}
          paint={{ "text-color": "#ffffff" }}
        />
      </GeoJSONSource>

      {userPos ? (
        <GeoJSONSource id="user" data={pointFeature(userPos)}>
          <Layer
            id="user-dot"
            type="circle"
            paint={{
              "circle-color": "#2563eb",
              "circle-radius": 7,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 3,
            }}
          />
        </GeoJSONSource>
      ) : null}
    </Map>
  );
}
