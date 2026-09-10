/**
 * Where along a route a given distance lands, and where along it each stop is.
 *
 * Everything here is measured in the Web Mercator unit square — the projection
 * `projectMercator` in `frames.ts` implements, and the one MapLibre's own
 * `line-progress` is measured in when a GeoJSON source has `lineMetrics` on.
 * That shared unit is what lets a caller drive a `line-gradient` from these
 * numbers: a length here divided by {@link routeLengths}'s `total` *is* the
 * `line-progress` value at that point, so a stop's arrival and the gradient's
 * tip agree without either being measured on screen.
 *
 * At city scale Mercator is close enough to uniform that a length here is also
 * proportional to ground distance, so a line drawn at a constant rate of it
 * moves at a constant apparent speed.
 */

import { projectMercator } from "./basemap/frames";

/** A polyline as `[lat, lon]` pairs — the shape `DC_ROUTE` and MapView's `line` use. */
export type Route = [number, number][];

type Vec = [number, number];

const project = ([lat, lon]: [number, number]): Vec => projectMercator(lon, lat);

const dist = (a: Vec, b: Vec) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * Cumulative length at every vertex of `route`, and the total.
 *
 * `cum[i]` is the length from the first vertex to vertex `i`, so `cum[0]` is 0
 * and `cum[cum.length - 1]` is `total`. A route of fewer than two points has
 * a total of 0.
 */
export function routeLengths(route: Route): { cum: number[]; total: number } {
  const cum: number[] = [];
  let acc = 0;
  let prev: Vec | undefined;
  for (const pt of route) {
    const p = project(pt);
    if (prev) acc += dist(prev, p);
    cum.push(acc);
    prev = p;
  }
  return { cum, total: acc };
}

/**
 * The `[lat, lon]` on `route` that is `length` along it, interpolated within
 * the segment it falls in. Clamped to the route's ends.
 *
 * `lengths` is {@link routeLengths}' result for the same route; it is passed
 * in rather than recomputed so a caller animating along a route pays for the
 * projection once.
 */
export function pointAt(
  route: Route,
  lengths: { cum: number[]; total: number },
  length: number,
): [number, number] {
  if (route.length === 0) throw new Error("pointAt: empty route");
  const { cum, total } = lengths;
  if (route.length === 1 || length <= 0) return [route[0][0], route[0][1]];
  if (length >= total) {
    const last = route[route.length - 1];
    return [last[0], last[1]];
  }
  // First vertex at or past `length`; the point lies on the segment before it.
  let i = 1;
  while (cum[i] < length) i++;
  const span = cum[i] - cum[i - 1];
  const t = span === 0 ? 0 : (length - cum[i - 1]) / span;
  const a = route[i - 1];
  const b = route[i];
  // Interpolated in geographic coordinates: over one segment of a city route
  // the difference from interpolating in projected space is far below a pixel.
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * The part of `route` up to `length`: every vertex before it, then the exact
 * point at `length` as the last vertex. Always at least two points — at 0 it
 * is the start twice, a zero-length line — so it can be drawn as a line
 * without a special case. The whole route at or past `total`.
 */
export function routePrefix(
  route: Route,
  lengths: { cum: number[]; total: number },
  length: number,
): Route {
  if (route.length === 0) throw new Error("routePrefix: empty route");
  if (route.length === 1) return [route[0], route[0]];
  if (length >= lengths.total) return route.map((p) => [p[0], p[1]]);
  const tip = pointAt(route, lengths, length);
  const before: Route = [];
  for (let i = 0; i < route.length && lengths.cum[i] < length; i++) before.push([...route[i]]);
  if (before.length === 0) before.push([route[0][0], route[0][1]]);
  return [...before, tip];
}

/**
 * For each stop, the length along `route` at which the route passes closest to
 * it — the moment a runner following the route "arrives" there.
 *
 * Each stop is projected onto every segment (clamped to the segment's ends)
 * and the nearest wins. Ties resolve to the *earlier* pass on purpose: a loop
 * starts and ends at the same place, and the stop sitting there is reached at
 * the start, not after the whole lap.
 */
export function arrivalLengths(
  route: Route,
  stops: { id: number; lat: number; lon: number }[],
): Record<number, number> {
  const pts = route.map(project);
  const { cum } = routeLengths(route);
  const out: Record<number, number> = {};
  for (const stop of stops) {
    const s = project([stop.lat, stop.lon]);
    let best = Infinity;
    let at = 0;
    if (pts.length === 1) {
      out[stop.id] = 0;
      continue;
    }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const ab: Vec = [b[0] - a[0], b[1] - a[1]];
      const lenSq = ab[0] * ab[0] + ab[1] * ab[1];
      const t =
        lenSq === 0
          ? 0
          : Math.max(0, Math.min(1, ((s[0] - a[0]) * ab[0] + (s[1] - a[1]) * ab[1]) / lenSq));
      const q: Vec = [a[0] + ab[0] * t, a[1] + ab[1] * t];
      const d = dist(s, q);
      // Strict: an equally near later pass never displaces the earlier one.
      if (d < best) {
        best = d;
        at = cum[i - 1] + (cum[i] - cum[i - 1]) * t;
      }
    }
    out[stop.id] = at;
  }
  return out;
}
