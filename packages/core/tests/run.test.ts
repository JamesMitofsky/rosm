import { beforeEach, describe, expect, it } from "vitest";
import { useRun, type RunPlan, type RunStop } from "../src/stores/run";
import type { Fountain } from "../src/schemas";

const stop = (id: number): RunStop => ({ id, lat: id, lon: id, tags: {}, status: "pending" });

const plan: RunPlan = {
  start: { lat: 48.8, lon: 2.3 },
  loop: false,
  tagKey: "amenity",
  tagValue: "toilets",
  stops: [stop(1), stop(2)],
  vias: [{ lat: 1, lon: 1 }],
  pool: [{ id: 9, lat: 9, lon: 9, tags: {} }],
  added: [],
  routeCoords: [
    [2.3, 48.8],
    [2.31, 48.81],
  ],
  distanceM: 1234,
  turns: [{ lat: 48.8, lon: 2.3, distM: 10, angle: 90 }],
};

beforeEach(() => {
  useRun.getState().reset();
});

describe("initial state", () => {
  it("has no plan", () => {
    const s = useRun.getState();
    expect(s.hasPlan).toBe(false);
    expect(s.stops).toEqual([]);
    expect(s.index).toBe(0);
    expect(s.routeId).toBe("");
  });
});

describe("setPlan", () => {
  it("installs the plan and arms a fresh run", () => {
    useRun.getState().setPlan(plan);
    const s = useRun.getState();
    expect(s.hasPlan).toBe(true);
    expect(s.stops).toHaveLength(2);
    expect(s.index).toBe(0);
    expect(s.changesetId).toBeUndefined();
    expect(s.routeId).not.toBe("");
  });

  it("issues a new routeId and clears the changeset on replan", () => {
    useRun.getState().setPlan(plan);
    const firstId = useRun.getState().routeId;
    useRun.getState().setChangeset(42);
    useRun.getState().setPlan(plan);
    expect(useRun.getState().routeId).not.toBe(firstId);
    expect(useRun.getState().changesetId).toBeUndefined();
  });
});

describe("hydrate", () => {
  it("restores a persisted run including index and changeset", () => {
    useRun.getState().hydrate({ ...plan, index: 1, changesetId: 7, routeId: "saved-route" });
    const s = useRun.getState();
    expect(s.hasPlan).toBe(true);
    expect(s.index).toBe(1);
    expect(s.changesetId).toBe(7);
    expect(s.routeId).toBe("saved-route");
  });

  it("backfills fields missing from runs persisted by older versions", () => {
    const legacy = { ...plan } as Record<string, unknown>;
    delete legacy.pool;
    delete legacy.added;
    delete legacy.tagValue;
    type HydrateArg = Parameters<ReturnType<typeof useRun.getState>["hydrate"]>[0];
    useRun.getState().hydrate(legacy as unknown as HydrateArg);
    const s = useRun.getState();
    expect(s.pool).toEqual([]);
    expect(s.added).toEqual([]);
    expect(s.tagValue).toBe("drinking_water");
    expect(s.index).toBe(0);
    expect(s.routeId).not.toBe("");
  });
});

describe("setStatus", () => {
  it("updates only the matching stop", () => {
    useRun.getState().setPlan(plan);
    useRun.getState().setStatus(1, "confirm");
    const s = useRun.getState();
    expect(s.stops[0].status).toBe("confirm");
    expect(s.stops[1].status).toBe("pending");
  });

  it("is a no-op for an unknown id", () => {
    useRun.getState().setPlan(plan);
    useRun.getState().setStatus(999, "removed");
    expect(useRun.getState().stops.map((st) => st.status)).toEqual(["pending", "pending"]);
  });
});

describe("run progress", () => {
  it("tracks the visit index", () => {
    useRun.getState().setPlan(plan);
    useRun.getState().setIndex(2);
    expect(useRun.getState().index).toBe(2);
  });

  it("records the shared changeset id", () => {
    useRun.getState().setChangeset(4242);
    expect(useRun.getState().changesetId).toBe(4242);
  });

  it("collects nodes added on the fly", () => {
    useRun.getState().setPlan(plan);
    const f: Fountain = { id: 77, lat: 0, lon: 0, tags: { amenity: "toilets" } };
    useRun.getState().addNode(f);
    useRun.getState().addNode({ ...f, id: 78 });
    expect(useRun.getState().added.map((a) => a.id)).toEqual([77, 78]);
  });
});

describe("reset", () => {
  it("returns to the empty state", () => {
    useRun.getState().setPlan(plan);
    useRun.getState().setStatus(1, "confirm");
    useRun.getState().setChangeset(1);
    useRun.getState().reset();
    const s = useRun.getState();
    expect(s.hasPlan).toBe(false);
    expect(s.stops).toEqual([]);
    expect(s.changesetId).toBeUndefined();
    expect(s.routeId).toBe("");
    expect(s.tagValue).toBe("drinking_water");
  });
});
