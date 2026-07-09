// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { archiveRoute, getArchivedRoutes, type RouteSnapshot } from "@/lib/routeArchive";

const KEY = "run-for-maps:archive";

function snap(routeId: string, index = 0): RouteSnapshot {
  return {
    routeId,
    plan: {
      start: { lat: 0, lon: 0 },
      loop: true,
      tagKey: "amenity",
      tagValue: "drinking_water",
      stops: [],
      vias: [],
      added: [],
      routeCoords: [],
      distanceM: 0,
      turns: [],
      index,
    },
    edits: [],
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-04T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("archiveRoute", () => {
  it("inserts a new route stamped with startedAt = updatedAt", () => {
    archiveRoute(snap("r1"));
    const [r] = getArchivedRoutes();
    expect(r.routeId).toBe("r1");
    expect(r.startedAt).toBe("2026-07-04T10:00:00.000Z");
    expect(r.updatedAt).toBe("2026-07-04T10:00:00.000Z");
  });

  it("upserts the same routeId in place, keeping startedAt", () => {
    archiveRoute(snap("r1", 0));
    vi.setSystemTime(new Date("2026-07-04T11:00:00Z"));
    archiveRoute(snap("r1", 3));

    const all = getArchivedRoutes();
    expect(all).toHaveLength(1);
    expect(all[0].plan.index).toBe(3);
    expect(all[0].startedAt).toBe("2026-07-04T10:00:00.000Z");
    expect(all[0].updatedAt).toBe("2026-07-04T11:00:00.000Z");
  });

  it("keeps distinct routes side by side", () => {
    archiveRoute(snap("r1"));
    vi.setSystemTime(new Date("2026-07-04T11:00:00Z"));
    archiveRoute(snap("r2"));
    expect(getArchivedRoutes()).toHaveLength(2);
  });

  it("ignores snapshots without a routeId", () => {
    archiveRoute(snap(""));
    expect(getArchivedRoutes()).toEqual([]);
  });

  it("recovers from corrupt storage instead of throwing", () => {
    window.localStorage.setItem(KEY, "{corrupt!");
    expect(getArchivedRoutes()).toEqual([]);
    archiveRoute(snap("r1"));
    expect(getArchivedRoutes()).toHaveLength(1);
  });

  it("treats a non-array payload as empty", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ nope: true }));
    expect(getArchivedRoutes()).toEqual([]);
  });
});

describe("getArchivedRoutes", () => {
  it("returns newest run first", () => {
    archiveRoute(snap("old"));
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
    archiveRoute(snap("new"));
    vi.setSystemTime(new Date("2026-07-04T11:00:00Z"));
    archiveRoute(snap("middle"));

    expect(getArchivedRoutes().map((r) => r.routeId)).toEqual(["new", "middle", "old"]);
  });
});
