// A run is a series of legs: one to each stop in turn and then, on a loop, one
// back to the start, since a loop isn't run until the runner is home. The run's
// `index` names the leg under way; once it reaches legCount the run is over.
//
// So on a loop `index === stops.length` is the way back, not the end: every
// stop is behind the runner, and the start is what they're heading for.
type Legs = { stops: readonly unknown[]; loop: boolean };
type Position = Legs & { index: number };

export function legCount(r: Legs): number {
  return r.stops.length + (r.loop ? 1 : 0);
}

// Every stop is behind the runner and the start lies ahead.
export function isHomeLeg(r: Position): boolean {
  return r.loop && r.index === r.stops.length;
}

export function isRunOver(r: Position): boolean {
  return r.index >= legCount(r);
}
