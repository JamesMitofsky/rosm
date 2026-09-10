import { describe, expect, it } from "vitest";
import { arrivalMs, easeInOut, legSchedule, lengthAt } from "@/lib/runReplay";

describe("easeInOut", () => {
  it("is at rest at both ends and halfway in the middle", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(1)).toBe(1);
  });

  it("clamps outside 0–1", () => {
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
  });

  it("is slower near the ends than in the middle", () => {
    const early = easeInOut(0.1) - easeInOut(0);
    const mid = easeInOut(0.55) - easeInOut(0.45);
    const late = easeInOut(1) - easeInOut(0.9);
    expect(early).toBeLessThan(mid);
    expect(late).toBeLessThan(mid);
  });
});

describe("legSchedule", () => {
  it("gives each leg time in proportion to its length", () => {
    const legs = legSchedule([0, 10, 40], 1000);
    expect(legs).toEqual([
      { fromMs: 0, toMs: 250, fromLen: 0, toLen: 10 },
      { fromMs: 250, toMs: 1000, fromLen: 10, toLen: 40 },
    ]);
  });

  it("sorts and de-duplicates the checkpoints", () => {
    const legs = legSchedule([40, 0, 10, 10], 1000);
    expect(legs.map((l) => [l.fromLen, l.toLen])).toEqual([
      [0, 10],
      [10, 40],
    ]);
  });

  it("ends exactly on the total", () => {
    const legs = legSchedule([0, 1 / 3, 2 / 3, 1], 1000);
    expect(legs[legs.length - 1].toMs).toBe(1000);
  });

  it("has no legs without two distinct checkpoints", () => {
    expect(legSchedule([], 1000)).toEqual([]);
    expect(legSchedule([5], 1000)).toEqual([]);
    expect(legSchedule([5, 5], 1000)).toEqual([]);
  });
});

describe("lengthAt", () => {
  const legs = legSchedule([0, 10, 40], 1000);

  it("is at the start before the replay and at the end after it", () => {
    expect(lengthAt(legs, -5)).toBe(0);
    expect(lengthAt(legs, 0)).toBe(0);
    expect(lengthAt(legs, 1000)).toBe(40);
    expect(lengthAt(legs, 5000)).toBe(40);
  });

  it("comes to rest at every checkpoint", () => {
    expect(lengthAt(legs, 250)).toBe(10);
    const justBefore = lengthAt(legs, 249);
    const justAfter = lengthAt(legs, 251);
    // Barely moving on either side of the stop.
    expect(10 - justBefore).toBeLessThan(0.01);
    expect(justAfter - 10).toBeLessThan(0.01);
  });

  it("is halfway along a leg halfway through its time", () => {
    expect(lengthAt(legs, 125)).toBe(5);
    expect(lengthAt(legs, 625)).toBe(25);
  });

  it("never runs backwards", () => {
    let prev = -1;
    for (let ms = 0; ms <= 1000; ms += 7) {
      const len = lengthAt(legs, ms);
      expect(len).toBeGreaterThanOrEqual(prev);
      prev = len;
    }
  });

  it("is zero with no legs", () => {
    expect(lengthAt([], 100)).toBe(0);
  });
});

describe("arrivalMs", () => {
  const legs = legSchedule([0, 10, 40], 1000);

  it("is the start for the first checkpoint", () => {
    expect(arrivalMs(legs, 0)).toBe(0);
  });

  it("is the end of the leg for every other checkpoint", () => {
    expect(arrivalMs(legs, 10)).toBe(250);
    expect(arrivalMs(legs, 40)).toBe(1000);
  });

  it("is undefined off a checkpoint or with no legs", () => {
    expect(arrivalMs(legs, 20)).toBeUndefined();
    expect(arrivalMs([], 0)).toBeUndefined();
  });
});
