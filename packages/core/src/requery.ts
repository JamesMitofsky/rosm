import { haversine, MAX_SEARCH_RADIUS_M, type Pt } from "./geo";

// "Search this area" gating, shared by every map that queries a viewport.
//
// A fountain search is a circle: its center and the radius that covers the
// viewport it was made for. After the user pans or zooms, the new viewport is
// another such circle. Re-querying is only worth offering once the two differ
// enough that the results would actually change — otherwise the button flickers
// on every idle settle and re-fetches the same points.

// A search's footprint: where it was centered and how far it reached.
export type Search = { center: Pt; radiusM: number };

// The viewport must drift this far past the last search, as a fraction of that
// search's radius, before a re-query is offered. 0.3 keeps the button quiet for
// small nudges while still surfacing it well before the old results run out.
export const REQUERY_FRACTION = 0.3;

// The radius a search can actually be made with. Zooming out past the API's cap
// doesn't widen the query — the server would refuse it — so it must not count as
// "moved" either; a viewport already at the cap that grows further is unchanged
// from the query's point of view.
export function clampSearchRadius(radiusM: number): number {
  return Math.min(radiusM, MAX_SEARCH_RADIUS_M);
}

// True once `view` has moved far enough from `last` that re-querying would
// surface different fountains: either the center panned by more than
// `fraction` of the old radius, or the radius grew/shrank by that much.
export function movedEnough(view: Search, last: Search, fraction = REQUERY_FRACTION): boolean {
  const r = clampSearchRadius(view.radiusM);
  const lastR = clampSearchRadius(last.radiusM);
  const threshold = lastR * fraction;
  const panned = haversine(view.center, last.center) > threshold;
  const resized = Math.abs(r - lastR) > threshold;
  return panned || resized;
}
