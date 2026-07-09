import { describe, expect, it } from "vitest";
import { POINT_TYPES, ptKey, ptLabel } from "@/lib/pointTypes";

describe("POINT_TYPES", () => {
  it("has unique key=value entries", () => {
    const keys = POINT_TYPES.map(ptKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("fills every field on every entry", () => {
    for (const pt of POINT_TYPES) {
      expect(pt.key).toBeTruthy();
      expect(pt.value).toBeTruthy();
      expect(pt.label).toBeTruthy();
      expect(pt.group).toBeTruthy();
    }
  });

  it("keeps the default survey target (drinking water) first", () => {
    expect(POINT_TYPES[0]).toMatchObject({ key: "amenity", value: "drinking_water" });
  });
});

describe("ptKey", () => {
  it("builds the stable key=value identifier", () => {
    expect(ptKey({ key: "amenity", value: "bench" })).toBe("amenity=bench");
  });
});

describe("ptLabel", () => {
  it("returns the curated label when known", () => {
    expect(ptLabel("amenity", "drinking_water")).toBe("Drinking water");
    expect(ptLabel("emergency", "defibrillator")).toBe("Defibrillator (AED)");
  });

  it("falls back to the de-underscored value for unknown tags", () => {
    expect(ptLabel("amenity", "dog_water_bowl")).toBe("dog water bowl");
    expect(ptLabel("nonexistent", "thing")).toBe("thing");
  });
});
