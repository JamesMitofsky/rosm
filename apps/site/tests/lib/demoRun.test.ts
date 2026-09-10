import { describe, expect, it } from "vitest";
import { DC_FOUNTAINS, DEMO_NEXT_STOP, SEED_STATUSES } from "@/lib/demoRoute";
import {
  DEMO_ARRIVALS,
  DEMO_CHECKPOINTS,
  DEMO_ROUTE_LENGTHS,
  DEMO_RUN_END,
  DEMO_SEEDED_IN_ORDER,
  demoRouteRunBy,
  demoRunnerAt,
  demoStatusesAt,
} from "@/lib/demoRun";

describe("the replay's end", () => {
  it("is the runner's arrival at the next stop", () => {
    expect(DEMO_RUN_END).toBe(DEMO_ARRIVALS[DEMO_NEXT_STOP]);
    expect(DEMO_RUN_END).toBeGreaterThan(0);
    expect(DEMO_RUN_END).toBeLessThan(DEMO_ROUTE_LENGTHS.total);
  });

  it("leaves the runner within a few tens of metres of that stop", () => {
    const stop = DC_FOUNTAINS.find((f) => f.id === DEMO_NEXT_STOP)!;
    const [lat, lon] = demoRunnerAt(DEMO_RUN_END);
    const mPerDegLat = 111_320;
    const mPerDegLon = mPerDegLat * Math.cos((stop.lat * Math.PI) / 180);
    const metres = Math.hypot((lat - stop.lat) * mPerDegLat, (lon - stop.lon) * mPerDegLon);
    expect(metres).toBeLessThan(60);
  });

  it("ends the drawn run where the runner stands", () => {
    const run = demoRouteRunBy(DEMO_RUN_END);
    expect(run[run.length - 1]).toEqual(demoRunnerAt(DEMO_RUN_END));
  });
});

describe("the surveyed stops", () => {
  it("are every seeded stop, in the order the route reaches them", () => {
    expect([...DEMO_SEEDED_IN_ORDER].sort((a, b) => a - b)).toEqual(
      Object.keys(SEED_STATUSES)
        .map(Number)
        .sort((a, b) => a - b),
    );
    for (let i = 1; i < DEMO_SEEDED_IN_ORDER.length; i++) {
      expect(DEMO_ARRIVALS[DEMO_SEEDED_IN_ORDER[i]]).toBeGreaterThan(
        DEMO_ARRIVALS[DEMO_SEEDED_IN_ORDER[i - 1]],
      );
    }
  });

  it("all come before the next stop, which is not among them", () => {
    expect(DEMO_NEXT_STOP in SEED_STATUSES).toBe(false);
    for (const id of DEMO_SEEDED_IN_ORDER) {
      expect(DEMO_ARRIVALS[id]).toBeLessThan(DEMO_RUN_END);
    }
  });
});

describe("demoStatusesAt", () => {
  it("shows only the stops the route starts on at the start", () => {
    const atStart = Object.fromEntries(
      DEMO_SEEDED_IN_ORDER.filter((id) => DEMO_ARRIVALS[id] === 0).map((id) => [
        id,
        SEED_STATUSES[id],
      ]),
    );
    expect(demoStatusesAt(0)).toEqual(atStart);
  });

  it("shows every surveyed stop, and only those, at the end", () => {
    const atEnd = demoStatusesAt(DEMO_RUN_END);
    expect(atEnd).toEqual(SEED_STATUSES);
    expect(atEnd[DEMO_NEXT_STOP]).toBeUndefined();
  });

  it("reveals a stop the moment the runner reaches it", () => {
    const stop = DEMO_SEEDED_IN_ORDER.find((id) => DEMO_ARRIVALS[id] > 0)!;
    const at = DEMO_ARRIVALS[stop];
    expect(demoStatusesAt(at - 1e-9)[stop]).toBeUndefined();
    expect(demoStatusesAt(at)[stop]).toBe(SEED_STATUSES[stop]);
  });
});

describe("the checkpoints", () => {
  it("run from the start to the end through every surveyed stop, ascending", () => {
    expect(DEMO_CHECKPOINTS[0]).toBe(0);
    expect(DEMO_CHECKPOINTS[DEMO_CHECKPOINTS.length - 1]).toBe(DEMO_RUN_END);
    for (const id of DEMO_SEEDED_IN_ORDER) {
      expect(DEMO_CHECKPOINTS).toContain(DEMO_ARRIVALS[id]);
    }
    for (let i = 1; i < DEMO_CHECKPOINTS.length; i++) {
      expect(DEMO_CHECKPOINTS[i]).toBeGreaterThan(DEMO_CHECKPOINTS[i - 1]);
    }
  });
});
