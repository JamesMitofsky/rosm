/**
 * The clock of a replayed run: a runner who sets off from one point, slows
 * into the next, and so on down a list of checkpoints, finishing the whole
 * thing in a fixed time.
 *
 * Pure arithmetic over lengths and milliseconds, so the component that plays
 * it (`DemoRunMap.svelte`) holds only the frame loop, and this can be checked
 * without one. The lengths are whatever unit the caller measures the route
 * in — `routeProgress` — and never converted here.
 */

/** One stretch between checkpoints: what is run, and when. */
export type Leg = {
  /** Time the runner leaves the leg's start, ms from the replay's start. */
  fromMs: number;
  /** Time the runner arrives at the leg's end. */
  toMs: number;
  /** Length along the route the leg starts at. */
  fromLen: number;
  /** Length along the route the leg ends at. */
  toLen: number;
};

/**
 * Quadratic ease in and out: at rest at both ends, fastest in the middle.
 * The shape of a runner leaving one point and pulling up at the next.
 */
export function easeInOut(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) * (-2 * u + 2)) / 2;
}

/**
 * Split `totalMs` across the legs between consecutive `checkpoints` — lengths
 * along the route, ascending — in proportion to each leg's length, so the
 * runner's average pace is the same on every leg. Repeated checkpoints (two
 * stops at the same point) make no leg. Fewer than two distinct checkpoints
 * make no legs at all.
 */
export function legSchedule(checkpoints: number[], totalMs: number): Leg[] {
  const points = [...new Set(checkpoints)].sort((a, b) => a - b);
  const span = points.length ? points[points.length - 1] - points[0] : 0;
  if (span <= 0) return [];
  const legs: Leg[] = [];
  let at = 0;
  for (let i = 1; i < points.length; i++) {
    const fromLen = points[i - 1];
    const toLen = points[i];
    const ms = (totalMs * (toLen - fromLen)) / span;
    legs.push({ fromMs: at, toMs: at + ms, fromLen, toLen });
    at += ms;
  }
  // The sum above can land a hair off `totalMs`; the last arrival is exact.
  legs[legs.length - 1].toMs = totalMs;
  return legs;
}

/**
 * How far along the route the runner is `ms` into a schedule: the start
 * before it begins, the end after it is over, and in between, eased along
 * whichever leg is under way.
 */
export function lengthAt(legs: Leg[], ms: number): number {
  if (!legs.length) return 0;
  if (ms <= legs[0].fromMs) return legs[0].fromLen;
  const last = legs[legs.length - 1];
  if (ms >= last.toMs) return last.toLen;
  const leg = legs.find((l) => ms < l.toMs) ?? last;
  const u = (ms - leg.fromMs) / (leg.toMs - leg.fromMs);
  return leg.fromLen + (leg.toLen - leg.fromLen) * easeInOut(u);
}

/**
 * When the runner arrives at `length` along the route: the end of the leg
 * that ends there, or the start of the schedule for its first checkpoint.
 * `undefined` for a length that is not a checkpoint.
 */
export function arrivalMs(legs: Leg[], length: number): number | undefined {
  if (!legs.length) return undefined;
  if (length === legs[0].fromLen) return legs[0].fromMs;
  return legs.find((l) => l.toLen === length)?.toMs;
}
