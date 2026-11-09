import { describe, expect, it } from "vitest";
import {
  fmtProgressDist,
  progressLine,
  runActivityState,
  shouldPostProgress,
  shouldUpdateActivity,
  ACTIVITY_REFRESH_MS,
  ACTIVITY_STALE_MS,
  PROGRESS_MIN_CHANGE_MS,
  PROGRESS_MIN_INTERVAL_MS,
  type PostedProgress,
  type ProgressLine,
} from "../src/runProgress";
import type { Turn } from "../src/brouter";

const FT = 0.3048;
const MI = 1609.344;

const turn = (distM: number, angle: number): Turn => ({ lat: 0, lon: 0, distM, angle });

describe("fmtProgressDist", () => {
  it("rounds to 50 ft steps under 1000 ft", () => {
    expect(fmtProgressDist(330 * FT)).toBe("350 ft");
    expect(fmtProgressDist(310 * FT)).toBe("300 ft");
    expect(fmtProgressDist(960 * FT)).toBe("950 ft");
  });

  it("never says 0 ft", () => {
    expect(fmtProgressDist(0)).toBe("50 ft");
    expect(fmtProgressDist(10 * FT)).toBe("50 ft");
  });

  it("switches to tenths of a mile once the step reaches 1000 ft", () => {
    expect(fmtProgressDist(990 * FT)).toBe("0.2 mi");
    expect(fmtProgressDist(1.44 * MI)).toBe("1.4 mi");
  });

  it("holds still while a runner covers a few meters", () => {
    expect(fmtProgressDist(300)).toBe(fmtProgressDist(304));
  });
});

describe("progressLine", () => {
  const base = { stopKey: "0:7", stopName: "Main St fountain", distToStopM: 500 };

  it("names the next stop and how far it is", () => {
    expect(progressLine({ ...base, nextTurn: null, distToTurnM: null })).toEqual({
      stop: "0:7",
      turn: null,
      body: "0.3 mi to Main St fountain",
    });
  });

  it("adds the side of the next turn, left for a negative angle", () => {
    const left = progressLine({ ...base, nextTurn: turn(120, -90), distToTurnM: 76 });
    expect(left.body).toBe("0.3 mi to Main St fountain • Next: Left in 250 ft");
    const right = progressLine({ ...base, nextTurn: turn(120, 60), distToTurnM: 76 });
    expect(right.body).toBe("0.3 mi to Main St fountain • Next: Right in 250 ft");
  });

  it("identifies the turn by where it is, not by how far off it is", () => {
    const a = progressLine({ ...base, nextTurn: turn(120, -90), distToTurnM: 76 });
    const b = progressLine({ ...base, nextTurn: turn(120, -90), distToTurnM: 20 });
    expect(a.turn).toBe(b.turn);
    expect(progressLine({ ...base, nextTurn: turn(300, -90), distToTurnM: 76 }).turn).not.toBe(
      a.turn,
    );
  });
});

describe("shouldPostProgress", () => {
  const line = (over: Partial<ProgressLine> = {}): ProgressLine => ({
    stop: "0:7",
    turn: "120",
    body: "0.3 mi to A • Next: Left in 250 ft",
    ...over,
  });
  const posted = (atMs: number, over: Partial<ProgressLine> = {}): PostedProgress => ({
    ...line(over),
    atMs,
  });

  it("posts when nothing is showing", () => {
    expect(shouldPostProgress(null, line(), 0)).toBe(true);
  });

  it("never reposts the same text", () => {
    expect(shouldPostProgress(posted(0), line(), 10 * PROGRESS_MIN_INTERVAL_MS)).toBe(false);
  });

  it("holds new distances back until the interval has passed", () => {
    const next = line({ body: "0.2 mi to A • Next: Left in 100 ft" });
    expect(shouldPostProgress(posted(0), next, PROGRESS_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(shouldPostProgress(posted(0), next, PROGRESS_MIN_INTERVAL_MS)).toBe(true);
  });

  it("posts a new target or a new turn soon, but not on every flip", () => {
    const newStop = line({ stop: "1:8", body: "0.5 mi to B" });
    const newTurn = line({ turn: "300", body: "0.3 mi to A • Next: Right in 600 ft" });
    for (const next of [newStop, newTurn]) {
      expect(shouldPostProgress(posted(0), next, PROGRESS_MIN_CHANGE_MS - 1)).toBe(false);
      expect(shouldPostProgress(posted(0), next, PROGRESS_MIN_CHANGE_MS)).toBe(true);
    }
  });

  it("posts the turn going away as a change", () => {
    const noTurn = line({ turn: null, body: "0.3 mi to A" });
    expect(shouldPostProgress(posted(0), noTurn, PROGRESS_MIN_CHANGE_MS)).toBe(true);
  });
});

describe("runActivityState", () => {
  const base = {
    stopKey: "2:7",
    stopName: "Main St fountain",
    stopNumber: 3,
    totalStops: 8,
    distToStopM: 500,
  };

  it("names the stop, where it falls in the run, and how far it is", () => {
    expect(runActivityState({ ...base, nextTurn: null, distToTurnM: null })).toEqual({
      stopName: "Main St fountain",
      leg: "Stop 3 of 8",
      stopDist: "0.3 mi",
      stopDistValue: "0.3",
      stopDistUnit: "mi",
      turn: null,
      turnSide: null,
    });
  });

  it("says when the runner is on the way back to the start", () => {
    const s = runActivityState({
      ...base,
      stopKey: "home",
      stopName: "the start",
      homeward: true,
      nextTurn: null,
      distToTurnM: null,
    });
    expect(s.leg).toBe("Back to start");
  });

  it("splits feet the same way, for the stacked compact view", () => {
    const s = runActivityState({ ...base, distToStopM: 76, nextTurn: null, distToTurnM: null });
    expect([s.stopDistValue, s.stopDistUnit]).toEqual(["250", "ft"]);
  });

  it("carries the next turn as the progress line words it", () => {
    const input = { ...base, nextTurn: turn(120, -90), distToTurnM: 76 };
    const s = runActivityState(input);
    expect(s.turn).toBe("Left in 250 ft");
    expect(s.turnSide).toBe("left");
    expect(progressLine(input).body).toContain(`Next: ${s.turn}`);
    expect(runActivityState({ ...input, nextTurn: turn(120, 45) }).turnSide).toBe("right");
  });

  it("shows no turn without a distance to it", () => {
    const s = runActivityState({ ...base, nextTurn: turn(120, -90), distToTurnM: null });
    expect([s.turn, s.turnSide]).toEqual([null, null]);
  });

  it("changes exactly when the progress line does, so one throttle serves both", () => {
    const at = (m: number) => ({ ...base, distToStopM: m, nextTurn: null, distToTurnM: null });
    expect(runActivityState(at(300))).toEqual(runActivityState(at(304)));
    expect(progressLine(at(300)).body).toBe(progressLine(at(304)).body);
    expect(runActivityState(at(300))).not.toEqual(runActivityState(at(500)));
  });
});

describe("shouldUpdateActivity", () => {
  const line: ProgressLine = { stop: "0:7", turn: null, body: "0.3 mi to A" };
  const posted = (atMs: number): PostedProgress => ({ ...line, atMs });

  it("updates whenever a notification would post", () => {
    expect(shouldUpdateActivity(null, line, 0)).toBe(true);
    const next = { ...line, body: "0.2 mi to A" };
    expect(shouldUpdateActivity(posted(0), next, PROGRESS_MIN_INTERVAL_MS)).toBe(true);
  });

  it("re-sends an unchanged activity before it would go stale", () => {
    expect(shouldUpdateActivity(posted(0), line, ACTIVITY_REFRESH_MS - 1)).toBe(false);
    expect(shouldUpdateActivity(posted(0), line, ACTIVITY_REFRESH_MS)).toBe(true);
    expect(ACTIVITY_REFRESH_MS).toBeLessThan(ACTIVITY_STALE_MS);
  });
});
