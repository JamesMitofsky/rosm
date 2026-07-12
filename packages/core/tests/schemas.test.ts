import { describe, expect, it } from "vitest";
import {
  CreateNodeRequest,
  EditLogEntrySchema,
  EditRequest,
  FountainSchema,
  FountainsRequest,
  RouteRequest,
  TagFilterSchema,
} from "../src/schemas";

describe("FountainSchema", () => {
  it("accepts an OSM point and defaults tags to {}", () => {
    const parsed = FountainSchema.parse({ id: 1, lat: 48.8, lon: 2.3 });
    expect(parsed.tags).toEqual({});
  });

  it("rejects non-numeric ids", () => {
    expect(FountainSchema.safeParse({ id: "1", lat: 0, lon: 0 }).success).toBe(false);
  });
});

describe("TagFilterSchema", () => {
  it("requires non-empty key and value", () => {
    expect(TagFilterSchema.safeParse({ key: "amenity", value: "toilets" }).success).toBe(true);
    expect(TagFilterSchema.safeParse({ key: "", value: "toilets" }).success).toBe(false);
    expect(TagFilterSchema.safeParse({ key: "amenity", value: "" }).success).toBe(false);
  });
});

describe("FountainsRequest", () => {
  const base = { lat: 48.8, lon: 2.3, radiusM: 1000, tag: { key: "amenity", value: "bench" } };

  it("fills defaults for recency and disused options", () => {
    const parsed = FountainsRequest.parse(base);
    expect(parsed.recencyMode).toBe("any");
    expect(parsed.recencyMonths).toBe(6);
    expect(parsed.includeDisused).toBe(false);
  });

  it("accepts explicit recency filtering", () => {
    const parsed = FountainsRequest.parse({
      ...base,
      recencyMode: "stale",
      recencyMonths: 12,
      includeDisused: true,
    });
    expect(parsed.recencyMode).toBe("stale");
    expect(parsed.recencyMonths).toBe(12);
    expect(parsed.includeDisused).toBe(true);
  });

  it("rejects a non-positive radius", () => {
    expect(FountainsRequest.safeParse({ ...base, radiusM: 0 }).success).toBe(false);
    expect(FountainsRequest.safeParse({ ...base, radiusM: -5 }).success).toBe(false);
  });

  it("rejects a radius past the max search radius", () => {
    expect(FountainsRequest.safeParse({ ...base, radiusM: 30_001 }).success).toBe(false);
  });

  it("accepts a bounds (bbox) mode search", () => {
    const parsed = FountainsRequest.parse({
      bounds: [48.8, 2.3, 48.82, 2.32],
      tag: { key: "amenity", value: "bench" },
    });
    expect(parsed.bounds).toEqual([48.8, 2.3, 48.82, 2.32]);
  });

  it("requires exactly one of radius-triplet or bounds", () => {
    const tag = { key: "amenity", value: "bench" };
    // Neither mode.
    expect(FountainsRequest.safeParse({ tag }).success).toBe(false);
    // Both modes.
    expect(FountainsRequest.safeParse({ ...base, bounds: [48.8, 2.3, 48.82, 2.32] }).success).toBe(
      false,
    );
  });

  it("rejects a bbox whose half-diagonal exceeds the max search radius", () => {
    // ~1° lat ≈ 111 km; half-diagonal well past the 30 km cap.
    expect(
      FountainsRequest.safeParse({
        bounds: [48, 2, 49, 3],
        tag: { key: "amenity", value: "bench" },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown recency modes", () => {
    expect(FountainsRequest.safeParse({ ...base, recencyMode: "old" }).success).toBe(false);
  });
});

describe("RouteRequest", () => {
  it("requires at least two waypoints", () => {
    expect(RouteRequest.safeParse({ points: [{ lat: 0, lon: 0 }], loop: false }).success).toBe(
      false,
    );
    expect(
      RouteRequest.safeParse({
        points: [
          { lat: 0, lon: 0 },
          { lat: 1, lon: 1 },
        ],
        loop: true,
      }).success,
    ).toBe(true);
  });
});

describe("EditRequest", () => {
  it("defaults tagKey to amenity", () => {
    const parsed = EditRequest.parse({ nodeId: 1, action: "confirm" });
    expect(parsed.tagKey).toBe("amenity");
    expect(parsed.changesetId).toBeUndefined();
  });

  it("accepts every survey action and rejects unknown ones", () => {
    for (const action of ["confirm", "out_of_order", "removed"]) {
      expect(EditRequest.safeParse({ nodeId: 1, action }).success).toBe(true);
    }
    expect(EditRequest.safeParse({ nodeId: 1, action: "explode" }).success).toBe(false);
  });

  it("bounds the free-text note at 255 chars", () => {
    const ok = EditRequest.safeParse({
      nodeId: 1,
      action: "confirm",
      extras: { note: "x".repeat(255) },
    });
    expect(ok.success).toBe(true);
    const tooLong = EditRequest.safeParse({
      nodeId: 1,
      action: "confirm",
      extras: { note: "x".repeat(256) },
    });
    expect(tooLong.success).toBe(false);
  });
});

describe("CreateNodeRequest", () => {
  it("accepts coordinates plus the surveyed tag", () => {
    const parsed = CreateNodeRequest.parse({
      lat: 48.8,
      lon: 2.3,
      tag: { key: "amenity", value: "drinking_water" },
    });
    expect(parsed.changesetId).toBeUndefined();
  });

  it("rejects a missing tag", () => {
    expect(CreateNodeRequest.safeParse({ lat: 48.8, lon: 2.3 }).success).toBe(false);
  });
});

describe("EditLogEntrySchema", () => {
  it("round-trips a persisted audit entry", () => {
    const entry = {
      nodeId: 5,
      action: "out_of_order",
      changesetId: 42,
      newVersion: 3,
      at: new Date().toISOString(),
      extras: { seasonal: true, note: "winterized" },
    };
    expect(EditLogEntrySchema.parse(entry)).toEqual(entry);
  });
});
