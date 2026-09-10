import { describe, expect, it } from "vitest";
import { MAX_SEARCH_RADIUS_M } from "../src/geo";
import { clampSearchRadius, movedEnough, REQUERY_FRACTION, type Search } from "../src/requery";

// ~111.2 m per 0.001° of latitude on the R=6371000 sphere.
const M_PER_MILLIDEG = (6371000 * Math.PI) / 180 / 1000;

const last: Search = { center: { lat: 38.9, lon: -77.0 }, radiusM: 2000 };
// Shift the center north by `m` meters, keeping the radius.
const panned = (m: number, radiusM = last.radiusM): Search => ({
  center: { lat: last.center.lat + m / M_PER_MILLIDEG / 1000, lon: last.center.lon },
  radiusM,
});

describe("clampSearchRadius", () => {
  it("passes radii under the cap through and clamps the rest", () => {
    expect(clampSearchRadius(500)).toBe(500);
    expect(clampSearchRadius(MAX_SEARCH_RADIUS_M)).toBe(MAX_SEARCH_RADIUS_M);
    expect(clampSearchRadius(MAX_SEARCH_RADIUS_M * 4)).toBe(MAX_SEARCH_RADIUS_M);
  });
});

describe("movedEnough", () => {
  it("is false for an unchanged viewport", () => {
    expect(movedEnough(last, last)).toBe(false);
  });

  it("trips once the center pans past the fraction of the old radius", () => {
    const threshold = last.radiusM * REQUERY_FRACTION; // 600 m
    expect(movedEnough(panned(threshold - 20), last)).toBe(false);
    expect(movedEnough(panned(threshold + 20), last)).toBe(true);
  });

  it("trips once the radius grows or shrinks past the fraction", () => {
    expect(movedEnough({ ...last, radiusM: last.radiusM * 1.29 }, last)).toBe(false);
    expect(movedEnough({ ...last, radiusM: last.radiusM * 1.31 }, last)).toBe(true);
    expect(movedEnough({ ...last, radiusM: last.radiusM * 0.71 }, last)).toBe(false);
    expect(movedEnough({ ...last, radiusM: last.radiusM * 0.69 }, last)).toBe(true);
  });

  it("does not keep re-tripping once the viewport is past the radius cap", () => {
    const capped: Search = { center: last.center, radiusM: MAX_SEARCH_RADIUS_M };
    // Zooming out further than the cap changes nothing the server would query.
    expect(movedEnough({ ...capped, radiusM: MAX_SEARCH_RADIUS_M * 3 }, capped)).toBe(false);
  });

  it("honors a custom fraction", () => {
    expect(movedEnough(panned(300), last, 0.1)).toBe(true);
    expect(movedEnough(panned(300), last, 0.5)).toBe(false);
  });
});
