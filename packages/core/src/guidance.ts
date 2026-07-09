// Pure live-run guidance: given the current GPS fix, the active target, and the
// routed geometry, derive everything the HUD shows — distance/bearing to the
// next point, how far along the route we are, and the next turn-by-turn maneuver.
// Extracted from the web run hook so the Expo run hook derives it identically.
import { bearing, haversine, nearestCumDistOnPath, type Pt } from "./geo";
import type { Turn } from "./brouter";

// Auto-arrival fires inside this radius; the proximity alert fires between the
// two (close enough to prep, not yet "here").
export const ARRIVAL_RADIUS_M = 30;
export const PROXIMITY_RADIUS_M = 80;

// A turn is "ahead" once we've passed within this margin of its vertex, so the
// HUD advances to the next maneuver a few meters before reaching it.
const TURN_LOOKAHEAD_M = 5;

export type RunGuidance = {
  distToTarget: number | null;
  bearingTo: number;
  traveledM: number;
  nextTurn: Turn | null;
  distToTurn: number | null;
  autoArrived: boolean;
};

export function runGuidance(
  pos: Pt | null,
  target: Pt | null,
  routeCoords: [number, number][],
  turns: Turn[],
): RunGuidance {
  const distToTarget = pos && target ? haversine(pos, target) : null;
  const bearingTo = pos && target ? bearing(pos, target) : 0;
  // Travel-relative maneuvers: where we are along the route (meters), then the
  // first precomputed turn still ahead of us.
  const traveledM = pos && routeCoords.length > 1 ? nearestCumDistOnPath(routeCoords, pos) : 0;
  const nextTurn = pos
    ? (turns.find((tn) => tn.distM > traveledM + TURN_LOOKAHEAD_M) ?? null)
    : null;
  const distToTurn = nextTurn ? nextTurn.distM - traveledM : null;
  const autoArrived = distToTarget != null && distToTarget < ARRIVAL_RADIUS_M;
  return { distToTarget, bearingTo, traveledM, nextTurn, distToTurn, autoArrived };
}
