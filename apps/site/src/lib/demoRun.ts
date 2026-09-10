/**
 * The geometry of the run the hero replays: how far along the route each stop
 * is, where the run has got to, and what the map shows before and after.
 *
 * Shared between the island that plays the replay (`DemoRunMap.svelte`) and
 * the build-time placeholder drawn into its loading frame
 * (`DemoRoutePlaceholder.astro`), which has to show exactly the frame the
 * replay starts from — and, under reduced motion, exactly the frame it ends
 * on. Two copies of "which stops are reached at this point" would be two
 * copies to keep in step; both read this one.
 */

import type { StopStatus } from "@rosm/core/stores/run";
import { DC_FOUNTAINS, DC_ROUTE, SEED_STATUSES } from "./demoRoute";
import { arrivalLengths, pointAt, routeLengths, routePrefix, type Route } from "./routeProgress";

/** Cumulative lengths of `DC_ROUTE`, in the unit `routeProgress` measures. */
export const DEMO_ROUTE_LENGTHS = routeLengths(DC_ROUTE);

/** How far along `DC_ROUTE` the runner reaches each fountain, by id. */
export const DEMO_ARRIVALS = arrivalLengths(DC_ROUTE, DC_FOUNTAINS);

/** Ids of every fountain, in the order the route reaches them. */
const IN_ROUTE_ORDER = DC_FOUNTAINS.map((f) => f.id).sort(
  (a, b) => DEMO_ARRIVALS[a] - DEMO_ARRIVALS[b],
);

/** The surveyed stops (`SEED_STATUSES`), in the order the route reaches them. */
export const DEMO_SEEDED_IN_ORDER = IN_ROUTE_ORDER.filter((id) => id in SEED_STATUSES);

/**
 * How far along the leg after the last surveyed stop the runner has got: the
 * replay ends here. Past the stop, so it is clearly done, and well short of
 * the next, so that one is clearly still to come.
 */
const LEG_FRACTION = 0.35;

/**
 * Where the run has got to, as a length along `DC_ROUTE`. Everything before
 * it is drawn as run; everything after is the plan.
 */
export const DEMO_RUN_END = (() => {
  const last = DEMO_SEEDED_IN_ORDER[DEMO_SEEDED_IN_ORDER.length - 1];
  if (last === undefined) return 0;
  const next = IN_ROUTE_ORDER.find((id) => DEMO_ARRIVALS[id] > DEMO_ARRIVALS[last]);
  const from = DEMO_ARRIVALS[last];
  const to = next === undefined ? DEMO_ROUTE_LENGTHS.total : DEMO_ARRIVALS[next];
  return from + (to - from) * LEG_FRACTION;
})();

/** The runner's `[lat, lon]` when the run has got `length` along the route. */
export function demoRunnerAt(length: number): [number, number] {
  return pointAt(DC_ROUTE, DEMO_ROUTE_LENGTHS, length);
}

/** The part of the route run so far, when the run has got `length` along it. */
export function demoRouteRunBy(length: number): Route {
  return routePrefix(DC_ROUTE, DEMO_ROUTE_LENGTHS, length);
}

/**
 * The statuses on show when the run has got `length` along the route: the
 * seeded status of every surveyed stop the runner has reached, and nothing for
 * the rest, which a caller renders as pending.
 */
export function demoStatusesAt(length: number): Record<number, StopStatus> {
  const out: Record<number, StopStatus> = {};
  for (const id of DEMO_SEEDED_IN_ORDER) {
    if (DEMO_ARRIVALS[id] <= length) out[id] = SEED_STATUSES[id];
  }
  return out;
}
