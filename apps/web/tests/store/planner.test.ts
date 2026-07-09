import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlanner, inRouteIdsOf, pinnedOf, removedOf, type Draft } from "@/store/planner";
import { useRun } from "@/store/run";
import { apiFetch } from "@/lib/api";
import type { Fountain } from "@/lib/schemas";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  isNative: vi.fn(() => false),
}));

vi.mock("@/lib/geolocation", () => ({
  getCurrentPosition: vi.fn(async () => ({ lat: 38.9, lon: -77.03 })),
}));

const apiFetchMock = vi.mocked(apiFetch);

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const fail = (body: unknown, status = 500) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const f = (id: number, lat: number, lon: number): Fountain => ({ id, lat, lon, tags: {} });

const CENTER = { lat: 38.9, lon: -77.03 };
const FOUNTAINS = [f(1, 38.901, -77.031), f(2, 38.902, -77.032), f(3, 38.903, -77.033)];

// A minimal successful BRouter response.
const routeOk = (distanceM = 5000) =>
  ok({
    coords: [
      [-77.03, 38.9],
      [-77.031, 38.901],
    ],
    distanceM,
    turns: [],
  });

const initialState = usePlanner.getInitialState();

beforeEach(() => {
  usePlanner.setState(initialState, true);
  useRun.getState().reset();
  apiFetchMock.mockReset();
});

describe("findPoints", () => {
  it("fetches the pool and resets all picks from a prior route", async () => {
    usePlanner.setState({
      center: CENTER,
      pinnedIds: [9],
      excludedIds: [8],
      stops: [f(9, 1, 1)],
      hasRoute: true,
      resumable: {} as Draft,
    });
    apiFetchMock.mockResolvedValueOnce(ok({ fountains: FOUNTAINS }));

    await usePlanner.getState().findPoints();

    const s = usePlanner.getState();
    expect(s.fountains).toEqual(FOUNTAINS);
    expect(s.pinnedIds).toEqual([]);
    expect(s.excludedIds).toEqual([]);
    expect(s.stops).toEqual([]);
    expect(s.hasRoute).toBe(false);
    expect(s.resumable).toBeNull();
    expect(s.err).toBeNull();
  });

  it("surfaces a retryable Overpass failure", async () => {
    usePlanner.setState({ center: CENTER });
    apiFetchMock.mockResolvedValueOnce(
      fail({ error: { message: "overpass busy", retryable: true } }),
    );

    await usePlanner.getState().findPoints();

    const s = usePlanner.getState();
    expect(s.err).toBe("overpass busy");
    expect(s.errRetryable).toBe(true);
    expect(s.busy).toBeNull();
  });
});

describe("planAndRoute", () => {
  it("builds stops and street geometry around a pinned point", async () => {
    usePlanner.setState({
      center: CENTER,
      fountains: FOUNTAINS,
      pinnedIds: [2],
      sizeMode: "points",
    });
    apiFetchMock.mockResolvedValueOnce(routeOk(4200));

    await usePlanner.getState().planAndRoute();

    const s = usePlanner.getState();
    expect(s.hasRoute).toBe(true);
    expect(s.stops.map((x) => x.id)).toContain(2);
    expect(s.distanceM).toBe(4200);
    // BRouter coords come back [lon,lat]; the map line stores [lat,lon].
    expect(s.line[0]).toEqual([38.9, -77.03]);
  });

  it("drops a stale overlapping plan — only the latest request writes", async () => {
    usePlanner.setState({
      center: CENTER,
      fountains: FOUNTAINS,
      pinnedIds: [1],
      sizeMode: "points",
    });

    let resolveFirst!: (r: Response) => void;
    apiFetchMock
      .mockImplementationOnce(() => new Promise<Response>((res) => (resolveFirst = res)))
      .mockImplementationOnce(async () => routeOk(2222));

    const first = usePlanner.getState().planAndRoute();
    const second = usePlanner.getState().planAndRoute();
    await second;
    expect(usePlanner.getState().distanceM).toBe(2222);

    // The slow first request finishes after the second — its result must be ignored.
    resolveFirst(routeOk(1111));
    await first;
    expect(usePlanner.getState().distanceM).toBe(2222);
    expect(usePlanner.getState().busy).toBeNull();
  });

  it("keeps hasRoute live when every point is removed, so adding one back re-plans", async () => {
    usePlanner.setState({
      center: CENTER,
      fountains: FOUNTAINS,
      excludedIds: [1, 2, 3],
      sizeMode: "points",
      hasRoute: true,
    });

    await usePlanner.getState().planAndRoute();

    const s = usePlanner.getState();
    expect(s.stops).toEqual([]);
    expect(s.hasRoute).toBe(true);
    expect(s.err).toMatch(/No points left/);
  });
});

describe("stop toggling", () => {
  it("toggleStop pins an available point and re-plans once a route exists", async () => {
    usePlanner.setState({
      center: CENTER,
      fountains: FOUNTAINS,
      sizeMode: "points",
      hasRoute: true,
    });
    apiFetchMock.mockResolvedValue(routeOk());

    usePlanner.getState().toggleStop(2);

    const s = usePlanner.getState();
    expect(s.pinnedIds).toContain(2);
    expect(inRouteIdsOf(s).has(2)).toBe(true);
    // replan fired against /api/route with the fresh pin already applied.
    expect(apiFetchMock).toHaveBeenCalledWith("/api/route", expect.anything());
  });

  it("toggleStop excludes an in-route point; restoreStop brings it back", () => {
    usePlanner.setState({
      center: CENTER,
      fountains: FOUNTAINS,
      stops: [FOUNTAINS[0]],
      pinnedIds: [1],
    });

    usePlanner.getState().toggleStop(1);
    let s = usePlanner.getState();
    expect(s.excludedIds).toContain(1);
    expect(s.pinnedIds).not.toContain(1);
    expect(removedOf(s).map((x) => x.id)).toEqual([1]);
    expect(pinnedOf(s)).toEqual([]);

    usePlanner.getState().restoreStop(1);
    s = usePlanner.getState();
    expect(s.excludedIds).toEqual([]);
  });
});

describe("draft resume", () => {
  const draft: Draft = {
    center: CENTER,
    tag: { key: "amenity", value: "drinking_water" },
    radiusMi: 2,
    recencyMode: "stale",
    recencyMonths: 6,
    targetMi: "",
    loop: true,
    fountains: FOUNTAINS,
    pinnedIds: [2],
    excludedIds: [3],
    vias: [],
    stops: [FOUNTAINS[1]],
    line: [[38.9, -77.03]],
    distanceM: 3000,
    turns: [],
    autoCount: 0,
  };

  it("loadDraft offers a saved route only when nothing is live in memory", async () => {
    apiFetchMock.mockResolvedValueOnce(ok(draft));
    await usePlanner.getState().loadDraft();
    expect(usePlanner.getState().resumable).toEqual(draft);
    expect(usePlanner.getState().draftReady).toBe(true);

    // A route already on screen must not be clobbered by a re-offer.
    usePlanner.setState(initialState, true);
    usePlanner.setState({ stops: [FOUNTAINS[0]] });
    apiFetchMock.mockResolvedValueOnce(ok(draft));
    await usePlanner.getState().loadDraft();
    expect(usePlanner.getState().resumable).toBeNull();
  });

  it("resumeDraft restores the route and jumps to the map phase", () => {
    usePlanner.setState({ resumable: draft });

    usePlanner.getState().resumeDraft();

    const s = usePlanner.getState();
    expect(s.phase).toBe("map");
    expect(s.stops).toEqual([FOUNTAINS[1]]);
    expect(s.pinnedIds).toEqual([2]);
    expect(s.hasRoute).toBe(true);
    expect(s.resumable).toBeNull();
  });
});

describe("startRun", () => {
  it("hands the plan to the run store, persists it, drops the draft, enters run phase", async () => {
    usePlanner.setState({
      center: CENTER,
      fountains: FOUNTAINS,
      stops: [FOUNTAINS[0], FOUNTAINS[1]],
      line: [
        [38.9, -77.03],
        [38.901, -77.031],
      ],
      distanceM: 3000,
    });
    apiFetchMock.mockResolvedValue(ok({ ok: true }));

    await usePlanner.getState().startRun();

    expect(usePlanner.getState().phase).toBe("run");
    const run = useRun.getState();
    expect(run.hasPlan).toBe(true);
    expect(run.stops.map((s) => s.id)).toEqual([1, 2]);
    expect(run.stops.every((s) => s.status === "pending")).toBe(true);
    // Plan coords flip back to BRouter's [lon,lat] order for persistence.
    expect(run.routeCoords[0]).toEqual([-77.03, 38.9]);
    expect(apiFetchMock).toHaveBeenCalledWith("/api/run", expect.anything());
    expect(apiFetchMock).toHaveBeenCalledWith("/api/draft", { method: "DELETE" });
  });
});

describe("resetAfterRun", () => {
  it("clears the route but keeps the start area for the next plan", () => {
    usePlanner.setState({
      center: CENTER,
      fountains: FOUNTAINS,
      stops: [FOUNTAINS[0]],
      hasRoute: true,
      phase: "run",
      step: 1,
      distanceM: 3000,
    });

    usePlanner.getState().resetAfterRun();

    const s = usePlanner.getState();
    expect(s.phase).toBe("config");
    expect(s.step).toBe(0);
    expect(s.stops).toEqual([]);
    expect(s.fountains).toEqual([]);
    expect(s.hasRoute).toBe(false);
    // The start point survives so the surveyor can build another route nearby.
    expect(s.center).toEqual(CENTER);
  });
});
