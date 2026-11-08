import { describe, expect, it } from "vitest";
import { isHomeLeg, isRunOver, legCount } from "../src/runLegs";

const stops = [1, 2, 3];
const at = (index: number, loop: boolean) => ({ stops, loop, index });

describe("runLegs", () => {
  it("gives a loop one more leg than it has stops: the way back to the start", () => {
    expect(legCount({ stops, loop: true })).toBe(4);
    expect(legCount({ stops, loop: false })).toBe(3);
  });

  it("keeps a loop going past its last stop until the runner is back", () => {
    expect(isHomeLeg(at(2, true))).toBe(false);
    expect(isHomeLeg(at(3, true))).toBe(true);
    expect(isRunOver(at(3, true))).toBe(false);
    expect(isHomeLeg(at(4, true))).toBe(false);
    expect(isRunOver(at(4, true))).toBe(true);
  });

  it("ends a one-way route at its last stop, with no way back", () => {
    expect(isHomeLeg(at(3, false))).toBe(false);
    expect(isRunOver(at(2, false))).toBe(false);
    expect(isRunOver(at(3, false))).toBe(true);
  });
});
