import { describe, expect, it } from "vitest";
import { runGuidance, ARRIVAL_RADIUS_M } from "../src/guidance";
import type { Turn } from "../src/brouter";

const turn = (distM: number, angle = 45): Turn => ({ lat: 0, lon: 0, distM, angle });

describe("runGuidance", () => {
  it("returns empty guidance with no GPS fix", () => {
    const g = runGuidance(null, { lat: 1, lon: 1 }, [], [turn(10)]);
    expect(g.distToTarget).toBeNull();
    expect(g.autoArrived).toBe(false);
    expect(g.nextTurn).toBeNull();
    expect(g.traveledM).toBe(0);
    expect(g.distToTurn).toBeNull();
  });

  it("auto-arrives when standing on the target", () => {
    const p = { lat: 40, lon: -74 };
    const g = runGuidance(p, p, [], []);
    expect(g.distToTarget).toBeLessThan(ARRIVAL_RADIUS_M);
    expect(g.autoArrived).toBe(true);
  });

  it("does not auto-arrive when far from the target", () => {
    const g = runGuidance({ lat: 40, lon: -74 }, { lat: 40.01, lon: -74 }, [], []);
    expect(g.distToTarget).toBeGreaterThan(ARRIVAL_RADIUS_M);
    expect(g.autoArrived).toBe(false);
  });

  it("picks the first turn beyond the lookahead margin", () => {
    // No usable route geometry → traveledM 0; the 3 m turn is within the 5 m
    // lookahead and skipped, the 60 m turn is next.
    const g = runGuidance({ lat: 40, lon: -74 }, { lat: 41, lon: -74 }, [], [turn(3), turn(60)]);
    expect(g.traveledM).toBe(0);
    expect(g.nextTurn?.distM).toBe(60);
    expect(g.distToTurn).toBe(60);
  });
});
