// The map page's URL fragment: where the camera is and which fountain is open.
//
//   #v=ZOOM/LAT/LON            the view
//   #v=ZOOM/LAT/LON&f=ID/LAT/LON   …and a selected fountain
//
// The address bar is the page's share surface — copy the URL and the recipient
// lands on the same view with the same fountain open. It goes in the fragment
// rather than the query so it never reaches the server or busts the prerendered
// page's cache.
//
// The fountain carries its own coordinates, not just its OSM id. There is no
// by-id endpoint: fountains only exist client-side as the result of an area
// query, so a link opened later — after the map has moved, or on a phone that
// auto-locates somewhere else — needs to know *where* to query to find the
// fountain again. The id is what identifies it once the query returns.

export type MapHashView = { lat: number; lon: number; zoom: number };
export type MapHashFountain = { id: number; lat: number; lon: number };
export type MapHash = { view?: MapHashView; fountain?: MapHashFountain };

// Zoom to 2 decimals (MapLibre's fractional zoom is continuous; finer than this
// is invisible). Coordinates to 5 decimals (~1 m) — enough to reopen the same
// view, short enough to keep the URL readable.
const ZOOM_DP = 2;
const COORD_DP = 5;

export function encodeMapHash(h: MapHash): string {
  const parts: string[] = [];
  if (h.view) {
    const { zoom, lat, lon } = h.view;
    parts.push(`v=${zoom.toFixed(ZOOM_DP)}/${lat.toFixed(COORD_DP)}/${lon.toFixed(COORD_DP)}`);
  }
  if (h.fountain) {
    const { id, lat, lon } = h.fountain;
    parts.push(`f=${id}/${lat.toFixed(COORD_DP)}/${lon.toFixed(COORD_DP)}`);
  }
  return parts.length ? `#${parts.join("&")}` : "";
}

const inRange = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;
const isLat = (n: number) => inRange(n, -90, 90);
const isLon = (n: number) => inRange(n, -180, 180);
// MapLibre's own zoom range.
const isZoom = (n: number) => inRange(n, 0, 24);

// Split "a/b/c" into numbers; `undefined` unless exactly `n` parts.
function nums(value: string, n: number): number[] | undefined {
  const parts = value.split("/");
  if (parts.length !== n) return undefined;
  const out = parts.map((p) => (p.trim() === "" ? NaN : Number(p)));
  return out.every(Number.isFinite) ? out : undefined;
}

// Never throws. Each key is validated on its own, so a hand-edited or truncated
// fragment keeps whatever part of it still makes sense; unknown keys are
// ignored so the format can grow.
export function decodeMapHash(hash: string): MapHash {
  const out: MapHash = {};
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!body) return out;
  for (const pair of body.split("&")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (key === "v") {
      const v = nums(value, 3);
      if (v && isZoom(v[0]) && isLat(v[1]) && isLon(v[2])) {
        out.view = { zoom: v[0], lat: v[1], lon: v[2] };
      }
    } else if (key === "f") {
      const f = nums(value, 3);
      if (f && Number.isInteger(f[0]) && f[0] > 0 && isLat(f[1]) && isLon(f[2])) {
        out.fountain = { id: f[0], lat: f[1], lon: f[2] };
      }
    }
  }
  return out;
}
