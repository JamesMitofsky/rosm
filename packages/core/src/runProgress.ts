// The run's progress for the lock screen: the next stop, how far it is and the
// next turn. On iOS it's a Live Activity; where there is none (Android, older
// iOS, Live Activities switched off) it's a notification line ("0.3 mi to Main
// St fountain • Next: Left in 250 ft").
//
// The guidance behind it changes with every GPS fix, about every 2 s at a run,
// but each update is a native round trip and, for a notification, wherever the
// system treats it as new, another alert. So distances are rounded to steps a
// runner can act on, and an update goes out only when it says something new, at
// most once per PROGRESS_MIN_INTERVAL_MS. A new target or a new next turn is
// what the runner needs to know, so it goes out sooner, held back only by
// PROGRESS_MIN_CHANGE_MS.
import { metersToFeet, metersToMiles, turnSide } from "./geo";
import type { Turn } from "./brouter";
import type { RunActivityState } from "./ports";

export const PROGRESS_MIN_INTERVAL_MS = 30_000;
// GPS jitter at a corner can flip the next turn back and forth on successive
// fixes; this keeps that from turning into a post per fix.
export const PROGRESS_MIN_CHANGE_MS = 5_000;

// A Live Activity is marked stale (and dims) once this long passes without an
// update, so one the app can no longer keep current (it was suspended or
// killed) stops passing an old distance off as live.
export const ACTIVITY_STALE_MS = 5 * 60_000;
// While the app is running, an unchanged activity is re-sent this often to
// push its stale time back. Well inside ACTIVITY_STALE_MS, so a runner waiting
// at a light doesn't see it dim.
export const ACTIVITY_REFRESH_MS = 2 * 60_000;

export type ProgressLine = {
  stop: string; // which stop the runner is heading for
  turn: string | null; // which maneuver comes next (the turn itself, not how far off)
  body: string;
};

export type PostedProgress = ProgressLine & { atMs: number };

// Everything the run screen knows about where the runner is headed, for both
// the notification line and the Live Activity.
export type RunProgressInput = {
  stopKey: string;
  stopName: string;
  stopNumber: number; // 1-based
  totalStops: number;
  // A loop's last leg: every stop is done and the runner is heading back to
  // the start, which stopName then names.
  homeward?: boolean;
  distToStopM: number;
  nextTurn: Turn | null;
  distToTurnM: number | null;
};

// A distance in steps that read at a glance: 50 ft up to 1000 ft, then tenths
// of a mile. Never "0 ft": a runner that close has arrived anyway.
export function fmtProgressDist(m: number): string {
  const ft = Math.round(metersToFeet(m) / 50) * 50;
  if (ft < 1000) return `${Math.max(ft, 50)} ft`;
  return `${metersToMiles(m).toFixed(1)} mi`;
}

// "Left in 250 ft", or null when no turn is left before the stop.
function turnText(nextTurn: Turn | null, distToTurnM: number | null): string | null {
  if (!nextTurn || distToTurnM == null) return null;
  const side = turnSide(nextTurn.angle);
  return `${side[0].toUpperCase()}${side.slice(1)} in ${fmtProgressDist(distToTurnM)}`;
}

export function progressLine(
  o: Pick<RunProgressInput, "stopKey" | "stopName" | "distToStopM" | "nextTurn" | "distToTurnM">,
): ProgressLine {
  const toStop = `${fmtProgressDist(o.distToStopM)} to ${o.stopName}`;
  const turn = turnText(o.nextTurn, o.distToTurnM);
  if (!o.nextTurn || !turn) return { stop: o.stopKey, turn: null, body: toStop };
  return {
    stop: o.stopKey,
    // A turn's distance along the route is unique to it.
    turn: String(o.nextTurn.distM),
    body: `${toStop} • Next: ${turn}`,
  };
}

// The Live Activity's props. Built from the same rounded figures as the
// progress line, so the two change together and one throttle serves both.
export function runActivityState(o: RunProgressInput): RunActivityState {
  const stopDist = fmtProgressDist(o.distToStopM);
  const [stopDistValue, stopDistUnit] = stopDist.split(" ");
  const turn = turnText(o.nextTurn, o.distToTurnM);
  return {
    stopName: o.stopName,
    leg: o.homeward ? "Back to start" : `Stop ${o.stopNumber} of ${o.totalStops}`,
    stopDist,
    stopDistValue,
    stopDistUnit,
    turn,
    turnSide: turn && o.nextTurn ? turnSide(o.nextTurn.angle) : null,
  };
}

// Whether `next` is worth a post, given what was posted last (null: nothing is
// showing).
export function shouldPostProgress(
  prev: PostedProgress | null,
  next: ProgressLine,
  nowMs: number,
): boolean {
  if (!prev) return true;
  const sinceMs = nowMs - prev.atMs;
  if (next.stop !== prev.stop || next.turn !== prev.turn) return sinceMs >= PROGRESS_MIN_CHANGE_MS;
  if (next.body === prev.body) return false;
  return sinceMs >= PROGRESS_MIN_INTERVAL_MS;
}

// Whether the Live Activity is due an update: whenever a notification would be,
// and also to keep an unchanged activity from going stale while the app runs.
export function shouldUpdateActivity(
  prev: PostedProgress | null,
  next: ProgressLine,
  nowMs: number,
): boolean {
  if (shouldPostProgress(prev, next, nowMs)) return true;
  return prev !== null && nowMs - prev.atMs >= ACTIVITY_REFRESH_MS;
}
