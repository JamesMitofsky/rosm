// Geo helpers: distance, bearing, unit conversion.

export type Pt = { lat: number; lon: number };

const R_EARTH_M = 6371000;
export const MILES_TO_M = 1609.344;

// Largest search radius we allow (meters), measured center→corner of the viewport.
// Caps how much OSM data a single query can pull: a viewport whose corner reaches
// past this is refused rather than sweeping a region/country of drinking-water
// nodes off the shared public Overpass mirrors. ~30 km comfortably covers a whole
// metro while blocking zoomed-way-out queries. Enforced both server-side (request
// schema) and client-side (the "Search this area" button gates on it). Because it
// is a real-world distance, the cap behaves identically on every screen size.
export const MAX_SEARCH_RADIUS_M = 30_000;

export function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function toDeg(r: number): number {
  return (r * 180) / Math.PI;
}

export function milesToMeters(mi: number): number {
  return mi * MILES_TO_M;
}

export function metersToMiles(m: number): number {
  return m / MILES_TO_M;
}

// Axis-aligned lat/lon box centered on `c`. `radiusM` is the vertical half-
// extent; the horizontal half-extent is `radiusM * aspect`, so passing the
// viewport's width/height ratio yields a box shaped like the screen (landscape →
// wider) instead of a square. Default aspect 1 is a square containing the circle.
// Returned as [[south, west], [north, east]] for Leaflet bounds.
export function boxAround(
  c: Pt,
  radiusM: number,
  aspect = 1,
): [[number, number], [number, number]] {
  const dLat = radiusM / 111320;
  const dLon = (radiusM * aspect) / (111320 * Math.cos(toRad(c.lat)));
  return [
    [c.lat - dLat, c.lon - dLon],
    [c.lat + dLat, c.lon + dLon],
  ];
}

// Width/height ratio of a lat/lon box in meters — the on-screen aspect ratio of
// a viewport with those bounds. >1 landscape, <1 portrait.
export function boxAspect(box: [[number, number], [number, number]]): number {
  const [[s, w], [n, e]] = box;
  const midLat = (s + n) / 2;
  const widthM = (e - w) * 111320 * Math.cos(toRad(midLat));
  const heightM = (n - s) * 111320;
  return heightM > 0 ? widthM / heightM : 1;
}

// Half-diagonal (center→corner) of a [south, west, north, east] bbox, in meters.
// Same metric as a viewport's center→corner search radius, so MAX_SEARCH_RADIUS_M
// caps circle and box queries on equal footing.
export function boundsHalfDiagonalM(bounds: [number, number, number, number]): number {
  const [s, w, n, e] = bounds;
  return haversine({ lat: (s + n) / 2, lon: (w + e) / 2 }, { lat: n, lon: e });
}

// Great-circle distance in meters between two points.
export function haversine(a: Pt, b: Pt): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Initial bearing from a to b, degrees clockwise from north (0..360).
export function bearing(a: Pt, b: Pt): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// 8-point compass label for a bearing.
export function compass(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

// Human distance: meters under 1000 -> "120 m", else miles "1.4 mi".
export function fmtDist(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${metersToMiles(m).toFixed(2)} mi`;
}

// How far along a [lon,lat] polyline the point nearest `p` sits, in meters from
// the path start. Projects `p` onto each segment (flat-earth — fine at street
// scale) and returns the cumulative distance to the closest projection. Used to
// turn a live GPS fix into "meters traveled" for picking the next turn.
export function nearestCumDistOnPath(coords: [number, number][], p: Pt): number {
  if (coords.length < 2) return 0;
  // Local equirectangular meters/degree at this latitude.
  const mPerLat = 111320;
  const mPerLon = 111320 * Math.cos(toRad(p.lat));
  const x = (lon: number) => lon * mPerLon;
  const y = (lat: number) => lat * mPerLat;
  const px = x(p.lon);
  const py = y(p.lat);
  let cum = 0;
  let best = Infinity;
  let bestDist = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = x(coords[i][0]);
    const ay = y(coords[i][1]);
    const bx = x(coords[i + 1][0]);
    const by = y(coords[i + 1][1]);
    const dx = bx - ax;
    const dy = by - ay;
    const segLen = Math.hypot(dx, dy);
    let t = segLen > 0 ? ((px - ax) * dx + (py - ay) * dy) / (segLen * segLen) : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < best) {
      best = d;
      bestDist = cum + t * segLen;
    }
    cum += segLen;
  }
  return bestDist;
}

// Human turn instruction for a signed turn angle (deg, + = right, − = left).
export function maneuver(angle: number): string {
  const a = Math.abs(angle);
  if (a < 20) return "Continue straight";
  const side = angle > 0 ? "right" : "left";
  if (a < 45) return `Slight ${side}`;
  if (a < 135) return `Turn ${side}`;
  if (a < 160) return `Sharp ${side}`;
  return "U-turn";
}

// Total length (meters) of an ordered path, optionally closed back to start.
export function pathLength(pts: Pt[], loop: boolean): number {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += haversine(pts[i], pts[i + 1]);
  if (loop && pts.length > 1) total += haversine(pts[pts.length - 1], pts[0]);
  return total;
}
