import type { Turn } from "./brouter";
import { compass, fmtDist, maneuver } from "./geo";

// What the run screen leads with, read at a glance mid-stride: how far to the
// next stop, which way it lies, and the next turn, if one comes before it.

export type RunCue = {
  distance: string; // "395 ft", "1.40 mi"
  direction: string; // 8-point compass toward the stop: "NE"
  turn: string | null; // "Turn left in 200 ft onto Oak St"
};

export function runCue(o: {
  distToTargetM: number | null;
  bearingTo: number;
  nextTurn: Turn | null;
  distToTurnM: number | null;
  // Where the stop sits along the route (meters from its start); a turn past
  // it belongs to the next leg. Unknown: every turn ahead counts.
  stopAlongM?: number;
}): RunCue | null {
  if (o.distToTargetM == null) return null;
  const turnAhead =
    o.nextTurn != null &&
    o.distToTurnM != null &&
    (o.stopAlongM === undefined || o.nextTurn.distM <= o.stopAlongM);
  return {
    distance: fmtDist(o.distToTargetM),
    direction: compass(o.bearingTo),
    turn: turnAhead
      ? `${maneuver(o.nextTurn!.angle)} in ${fmtDist(o.distToTurnM!)}${
          o.nextTurn!.name ? ` onto ${o.nextTurn!.name}` : ""
        }`
      : null,
  };
}
