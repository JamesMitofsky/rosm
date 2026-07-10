import { describe, expect, it } from "vitest";
import {
  countBy,
  fountainName,
  isDogWater,
  isOutOfService,
  rankFountains,
  svcOf,
  toggled,
  waterOf,
} from "@/lib/fountainFilters";
import type { Fountain } from "@/lib/schemas";

const f = (id: number, lat: number, lon: number, tags: Record<string, string> = {}): Fountain => ({
  id,
  lat,
  lon,
  tags,
});

describe("classification", () => {
  it("flags dog water", () => {
    expect(isDogWater({ drinking_water: "no" })).toBe(true);
    expect(isDogWater({ drinking_water: "yes" })).toBe(false);
    expect(isDogWater({})).toBe(false);
    expect(waterOf({ drinking_water: "no" })).toBe("dog");
    expect(waterOf({})).toBe("human");
  });

  it("flags out-of-service via lifecycle tags", () => {
    expect(isOutOfService({ "disused:amenity": "drinking_water" })).toBe(true);
    expect(isOutOfService({ "abandoned:amenity": "drinking_water" })).toBe(true);
    expect(isOutOfService({ disused: "yes" })).toBe(true);
    expect(isOutOfService({ amenity: "drinking_water" })).toBe(false);
    expect(svcOf({ disused: "yes" })).toBe("out");
    expect(svcOf({})).toBe("in");
  });

  it("names fountains with a fallback", () => {
    expect(fountainName(f(1, 0, 0, { name: "Central" }))).toBe("Central");
    expect(fountainName(f(1, 0, 0))).toBe("Unnamed fountain");
  });
});

describe("rankFountains", () => {
  it("sorts nearest-first from the anchor", () => {
    const anchor = { lat: 0, lon: 0 };
    const ranked = rankFountains([f(1, 1, 1), f(2, 0.1, 0.1), f(3, 0.5, 0.5)], anchor);
    expect(ranked.map((r) => r.f.id)).toEqual([2, 3, 1]);
    expect(ranked[0].distM).toBeGreaterThan(0);
  });

  it("leaves distances null without an anchor", () => {
    const ranked = rankFountains([f(1, 1, 1)], null);
    expect(ranked[0].distM).toBeNull();
  });
});

describe("countBy", () => {
  it("tallies each dimension independently", () => {
    const ranked = rankFountains(
      [
        f(1, 0, 0, { check_date: "2026-02-01" }),
        f(2, 0, 0, { drinking_water: "no" }),
        f(3, 0, 0, { disused: "yes", check_date: "2019-01-01" }),
      ],
      null,
    );
    expect(countBy(ranked)).toEqual({
      inN: 2,
      outN: 1,
      humanN: 2,
      dogN: 1,
    });
  });
});

describe("toggled", () => {
  it("adds and removes without mutating", () => {
    const base = new Set(["a"]);
    expect(toggled(base, "b")).toEqual(new Set(["a", "b"]));
    expect(toggled(base, "a")).toEqual(new Set());
    expect(base).toEqual(new Set(["a"]));
  });
});
