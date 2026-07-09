// OSM raster base, matching the web Leaflet look. The tile URL is env-overridable
// so switching to MapTiler / OpenFreeMap (which permit heavier / offline use) is a
// config change — never bulk-download against tile.openstreetmap.org. The glyphs
// endpoint is needed for SymbolLayer text (marker numbers).
const TILE_URL =
  process.env.EXPO_PUBLIC_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const OSM_STYLE_JSON = JSON.stringify({
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: [TILE_URL],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm-tiles", type: "raster", source: "osm" }],
});
