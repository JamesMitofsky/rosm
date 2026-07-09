// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRunSession } from "@/hooks/useRunSession";
import { useRun, type RunPlan } from "@/store/run";
import { useOutbox } from "@/store/outbox";
import { archiveRoute, getArchivedRoutes } from "@/lib/routeArchive";
import { apiFetch } from "@/lib/api";
import { celebratePoint } from "@/lib/confetti";
import { hapticSuccess } from "@/lib/haptics";
import { allowSleep, keepAwake } from "@/lib/keepAwake";
import { notifyProximity, notifyRunComplete } from "@/lib/notify";
import { watchRunPosition } from "@/lib/geolocation";
import type { EditAction } from "@/lib/schemas";

type Watcher = {
  onPoint: (p: { lat: number; lon: number; heading: number | null }) => void;
  onError: (msg: string) => void;
  clear: ReturnType<typeof vi.fn>;
};

const h = vi.hoisted(() => ({
  native: { value: false },
  osm: { value: { loggedIn: true, apiBase: "https://api.test", live: false } },
  watchers: [] as {
    onPoint: (p: { lat: number; lon: number; heading: number | null }) => void;
    onError: (msg: string) => void;
    clear: () => void;
  }[],
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  isNative: () => h.native.value,
}));
vi.mock("@/lib/geolocation", () => ({
  watchRunPosition: vi.fn(async (onPoint: Watcher["onPoint"], onError: Watcher["onError"]) => {
    const clear = vi.fn();
    h.watchers.push({ onPoint, onError, clear });
    return { clear };
  }),
}));
vi.mock("@/lib/haptics", () => ({ hapticSuccess: vi.fn(async () => {}) }));
vi.mock("@/lib/keepAwake", () => ({
  keepAwake: vi.fn(async () => {}),
  allowSleep: vi.fn(async () => {}),
}));
vi.mock("@/lib/notify", () => ({
  ensureNotifyPermission: vi.fn(async () => true),
  notifyProximity: vi.fn(async () => {}),
  notifyRunComplete: vi.fn(async () => {}),
  notifySyncPending: vi.fn(async () => {}),
}));
vi.mock("@/lib/liveActivity", () => ({
  startRunActivity: vi.fn(async () => {}),
  updateRunActivity: vi.fn(async () => {}),
  endRunActivity: vi.fn(async () => {}),
}));
vi.mock("@/lib/confetti", () => ({ celebratePoint: vi.fn() }));
vi.mock("@/lib/useHeading", () => ({
  useHeading: (gps: number | null) => ({
    heading: gps,
    needsCompassPermission: false,
    requestCompass: vi.fn(),
  }),
}));
vi.mock("@/components/OsmStatus", () => ({
  useOsmStatus: () => ({ status: h.osm.value, refresh: vi.fn() }),
}));
vi.mock("@/components/PointPopup", () => ({ default: () => null }));
vi.mock("@/lib/idb", () => ({
  idbGetAll: vi.fn(async () => []),
  idbPut: vi.fn(async () => {}),
  idbDelete: vi.fn(async () => {}),
  idbClearOutbox: vi.fn(async () => {}),
  idbGetMeta: vi.fn(async () => undefined),
  idbSetMeta: vi.fn(async () => {}),
}));

const apiFetchMock = vi.mocked(apiFetch);

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const basePlan: RunPlan = {
  start: { lat: 0, lon: 0 },
  loop: false,
  tagKey: "amenity",
  tagValue: "drinking_water",
  stops: [
    { id: 1, lat: 0, lon: 0.001, tags: { name: "First" }, status: "pending" },
    { id: 2, lat: 0, lon: 0.002, tags: {}, status: "pending" },
  ],
  vias: [{ lat: 0.0005, lon: 0.0005 }],
  // id 50 is off-route (dimmed); id 1 duplicates a route stop and must be excluded.
  pool: [
    { id: 50, lat: 0.005, lon: 0.005, tags: {} },
    { id: 1, lat: 0, lon: 0.001, tags: {} },
  ],
  added: [],
  routeCoords: [
    [0, 0],
    [0.001, 0],
    [0.002, 0],
  ],
  distanceM: 250,
  turns: [{ lat: 0, lon: 0.001, distM: 111, angle: -90, name: "Rue" }],
};

function arm(plan: RunPlan = basePlan) {
  useRun.getState().setPlan(structuredClone(plan));
}

beforeEach(() => {
  h.native.value = false;
  h.osm.value = { loggedIn: true, apiBase: "https://api.test", live: false };
  h.watchers.length = 0;
  window.localStorage.clear();
  useRun.getState().reset();
  useOutbox.setState({ items: [], changesetId: undefined, hydrated: true });
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (path, init) => {
    if (path === "/api/run" && !init?.method) return jsonRes(null);
    if (path === "/api/run") return jsonRes({ ok: true });
    if (path === "/api/osm/edit")
      return jsonRes({ changesetId: 42, newVersion: 2, changesetUrl: "https://osm.test/cs/42" });
    if (path === "/api/osm/create")
      return jsonRes({
        changesetId: 42,
        changesetUrl: "https://osm.test/cs/42",
        nodeId: 999,
        lat: 10,
        lon: 20,
        tags: { amenity: "drinking_water", check_date: "2026-07-04" },
        summary: "added amenity=drinking_water",
      });
    if (path === "/api/osm/close")
      return jsonRes({ ok: true, changesetUrl: "https://osm.test/cs/42" });
    return jsonRes(null);
  });
});

describe("hydration", () => {
  it("hydrates a saved run from the server on a cold web mount", async () => {
    apiFetchMock.mockImplementation(async (path, init) => {
      if (path === "/api/run" && !init?.method)
        return jsonRes({ ...basePlan, index: 1, changesetId: 7, routeId: "saved" });
      return jsonRes(null);
    });

    const { result } = renderHook(() => useRunSession());
    expect(result.current.hydrating).toBe(true);
    await waitFor(() => expect(result.current.hydrating).toBe(false));

    expect(useRun.getState().hasPlan).toBe(true);
    expect(result.current.index).toBe(1);
    expect(result.current.target?.id).toBe(2);
  });

  it("finishes hydrating quietly when the server has no run", async () => {
    const { result } = renderHook(() => useRunSession());
    await waitFor(() => expect(result.current.hydrating).toBe(false));
    expect(useRun.getState().hasPlan).toBe(false);
    expect(result.current.done).toBe(false);
  });

  it("recovers the latest archived route on a native cold mount", async () => {
    h.native.value = true;
    archiveRoute({
      routeId: "archived-1",
      plan: { ...structuredClone(basePlan), index: 1 },
      edits: [],
    });

    const { result } = renderHook(() => useRunSession());
    await waitFor(() => expect(result.current.hydrating).toBe(false));

    expect(useRun.getState().hasPlan).toBe(true);
    expect(useRun.getState().index).toBe(1);
    // Native never asks the server for run state.
    expect(apiFetchMock.mock.calls.filter((c) => c[0] === "/api/run")).toHaveLength(0);
  });

  it("skips hydration when the planner already installed a plan", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    expect(result.current.hydrating).toBe(false);
    expect(
      apiFetchMock.mock.calls.filter((c) => c[0] === "/api/run" && !c[1]?.method),
    ).toHaveLength(0);
  });
});

describe("disabled sessions", () => {
  it("arms nothing until enabled", () => {
    const { result } = renderHook(() => useRunSession({ enabled: false }));
    expect(result.current.hydrating).toBe(false);
    expect(vi.mocked(watchRunPosition)).not.toHaveBeenCalled();
    expect(vi.mocked(keepAwake)).not.toHaveBeenCalled();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe("live guidance", () => {
  it("derives distance, bearing and compass label from the GPS fix", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    expect(vi.mocked(watchRunPosition)).toHaveBeenCalledTimes(1);

    act(() => h.watchers[0].onPoint({ lat: 0, lon: 0.0005, heading: 45 }));

    expect(result.current.target?.id).toBe(1);
    expect(result.current.distToTarget).toBeCloseTo(55.6, 0);
    expect(result.current.bearingTo).toBeCloseTo(90, 1);
    expect(result.current.heading).toBe("E");
    expect(result.current.userPos).toEqual([0, 0.0005]);
    expect(result.current.userHeading).toBe(45); // GPS heading via useHeading fallback
    expect(result.current.arrived).toBe(false);
  });

  it("picks the next precomputed turn ahead of the traveled distance", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    act(() => h.watchers[0].onPoint({ lat: 0, lon: 0.0005, heading: null }));

    expect(result.current.nextTurn?.name).toBe("Rue");
    // ~55.7 m traveled along the route; the turn sits at 111 m.
    expect(result.current.distToTurn).toBeCloseTo(111 - 0.0005 * 111320, 0);
  });

  it("flips to arrived inside the 30 m radius", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    act(() => h.watchers[0].onPoint({ lat: 0, lon: 0.00099, heading: null }));
    expect(result.current.arrived).toBe(true);
  });

  it("supports manual arrival before any GPS fix", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    expect(result.current.arrived).toBe(false);
    act(() => result.current.setManualArrived(true));
    expect(result.current.arrived).toBe(true);
  });

  it("surfaces GPS errors", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    act(() => h.watchers[0].onError("permission denied"));
    expect(result.current.err).toBe("Location: permission denied");
  });

  it("notifies proximity once per target inside the 30-80 m band", async () => {
    arm();
    renderHook(() => useRunSession());

    act(() => h.watchers[0].onPoint({ lat: 0, lon: 0.00055, heading: null }));
    act(() => h.watchers[0].onPoint({ lat: 0, lon: 0.0006, heading: null }));

    await waitFor(() => expect(vi.mocked(notifyProximity)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(notifyProximity)).toHaveBeenCalledWith("First", expect.any(Number));
  });
});

describe("recording edits", () => {
  it("records the current target offline-first, celebrates, advances and persists", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());

    act(() => result.current.record("confirm"));

    // Immediate, before any network round-trip:
    expect(useRun.getState().stops[0].status).toBe("confirm");
    expect(useRun.getState().index).toBe(1);
    expect(vi.mocked(celebratePoint)).toHaveBeenCalled();
    expect(vi.mocked(hapticSuccess)).toHaveBeenCalled();
    expect(result.current.lastSaved?.summary).toContain("confirmed");

    // Outbox sends in the background and adopts the server's changeset.
    await waitFor(() => expect(useOutbox.getState().items[0]?.syncState).toBe("sent"));
    expect(useOutbox.getState().changesetId).toBe(42);

    // Durable local archive captured the status change.
    const archived = getArchivedRoutes();
    expect(archived).toHaveLength(1);
    expect(archived[0].plan.stops[0].status).toBe("confirm");
    expect(archived[0].plan.index).toBe(1);

    // And the run state was pushed to the server.
    await waitFor(() =>
      expect(
        apiFetchMock.mock.calls.filter((c) => c[0] === "/api/run" && c[1]?.method === "POST")
          .length,
      ).toBeGreaterThan(0),
    );
  });

  it("records a tapped off-route point without advancing the run", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());

    const dim = result.current.markers.find((m) => m.id === 50);
    expect(dim?.dimmed).toBe(true);
    const popup = dim?.popup as ReactElement<{
      onAction: (action: EditAction) => void;
    }>;
    act(() => popup.props.onAction("out_of_order"));

    expect(useRun.getState().index).toBe(0); // position unchanged
    await waitFor(() => expect(useOutbox.getState().items).toHaveLength(1));
    expect(useOutbox.getState().items[0].nodeId).toBe(50);
    expect(useOutbox.getState().items[0].action).toBe("out_of_order");
  });

  it("skip marks the stop and moves on without recording", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    act(() => result.current.skip());

    expect(useRun.getState().stops[0].status).toBe("skipped");
    expect(useRun.getState().index).toBe(1);
    expect(result.current.lastSaved).toBeNull();
    expect(useOutbox.getState().items).toHaveLength(0);
  });

  it("goBack reopens the previous stop; no-op at the first stop", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());

    act(() => result.current.goBack());
    expect(useRun.getState().index).toBe(0);

    act(() => result.current.skip());
    expect(useRun.getState().index).toBe(1);

    act(() => result.current.goBack());
    expect(useRun.getState().index).toBe(0);
    expect(useRun.getState().stops[0].status).toBe("pending");
  });

  it("notifies completion once when the last stop is handled", async () => {
    arm({ ...basePlan, stops: [basePlan.stops[0]] });
    const { result } = renderHook(() => useRunSession());

    act(() => result.current.record("confirm"));

    expect(result.current.done).toBe(true);
    await waitFor(() => expect(vi.mocked(notifyRunComplete)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(notifyRunComplete)).toHaveBeenCalledWith(1);
  });
});

describe("addHere", () => {
  it("requires an OSM session", async () => {
    h.osm.value = { loggedIn: false, apiBase: "https://api.test", live: false };
    arm();
    const { result } = renderHook(() => useRunSession());
    await act(async () => result.current.addHere());
    expect(result.current.err).toBe("Sign in to OSM first.");
  });

  it("requires a GPS fix", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    await act(async () => result.current.addHere());
    expect(result.current.err).toBe("Waiting for GPS fix.");
  });

  it("creates a node at the current position and shares the changeset", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    act(() => h.watchers[0].onPoint({ lat: 10, lon: 20, heading: null }));

    await act(async () => result.current.addHere());

    expect(useRun.getState().added.map((a) => a.id)).toEqual([999]);
    expect(useOutbox.getState().changesetId).toBe(42);
    expect(result.current.lastSaved?.summary).toBe("added amenity=drinking_water");

    const createCall = apiFetchMock.mock.calls.find((c) => c[0] === "/api/osm/create");
    expect(createCall).toBeTruthy();
    expect(JSON.parse(createCall![1]?.body as string)).toMatchObject({
      lat: 10,
      lon: 20,
      tag: { key: "amenity", value: "drinking_water" },
    });
  });

  it("surfaces creation failures", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    act(() => h.watchers[0].onPoint({ lat: 10, lon: 20, heading: null }));
    apiFetchMock.mockImplementation(async (path) =>
      path === "/api/osm/create" ? jsonRes({ error: "boom" }, 502) : jsonRes(null),
    );

    await act(async () => result.current.addHere());
    expect(result.current.err).toBe("boom");
    expect(result.current.adding).toBe(false);
  });
});

describe("finish and reset", () => {
  it("closes the shared changeset and reports its URL", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    act(() => useOutbox.getState().setChangeset(42));

    await act(async () => result.current.finish());

    expect(result.current.closed).toEqual({ changesetUrl: "https://osm.test/cs/42" });
    const closeCall = apiFetchMock.mock.calls.find((c) => c[0] === "/api/osm/close");
    expect(JSON.parse(closeCall![1]?.body as string)).toEqual({ changesetId: 42 });
    // The closed id is dropped so a later session can't rehydrate it.
    expect(useOutbox.getState().changesetId).toBeUndefined();
  });

  it("treats an already-closed changeset as finished and drops the stale id", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    act(() => useOutbox.getState().setChangeset(42));
    apiFetchMock.mockImplementation(async (path) =>
      path === "/api/osm/close"
        ? jsonRes(
            {
              ok: false,
              error: "close changeset 409: The changeset 42 was closed at 2026-06-30 02:37:57 UTC.",
            },
            502,
          )
        : jsonRes(null),
    );

    await act(async () => result.current.finish());
    expect(result.current.finishErr).toBeNull();
    expect(result.current.closed).toEqual({});
    expect(useOutbox.getState().changesetId).toBeUndefined();
  });

  it("finishes cleanly when no changeset was ever opened", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    await act(async () => result.current.finish());

    expect(result.current.closed).toEqual({});
    expect(apiFetchMock.mock.calls.filter((c) => c[0] === "/api/osm/close")).toHaveLength(0);
  });

  it("keeps the failure visible when closing fails", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    act(() => useOutbox.getState().setChangeset(42));
    apiFetchMock.mockImplementation(async (path) =>
      path === "/api/osm/close"
        ? jsonRes({ ok: false, error: "close failed hard" }, 502)
        : jsonRes(null),
    );

    await act(async () => result.current.finish());
    expect(result.current.finishErr).toBe("close failed hard");
    expect(result.current.closed).toBeNull();
  });

  it("reset clears the run and the outbox for the next route", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    act(() => result.current.record("confirm"));
    await waitFor(() => expect(useOutbox.getState().items).toHaveLength(1));

    act(() => result.current.reset());

    expect(useRun.getState().hasPlan).toBe(false);
    await waitFor(() => expect(useOutbox.getState().items).toHaveLength(0));
    expect(useOutbox.getState().changesetId).toBeUndefined();
  });
});

describe("map feed", () => {
  it("builds markers for stops, vias and dimmed off-route pool points", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());

    const markers = result.current.markers;
    expect(markers).toHaveLength(4); // 1 dim + 2 stops + 1 via

    const current = markers.find((m) => m.id === 1);
    expect(current?.color).toBe("#2563eb"); // active pending target
    expect(current?.label).toBe("1");

    const dim = markers.find((m) => m.id === 50);
    expect(dim?.dimmed).toBe(true);

    const via = markers.find((m) => m.id === "via-0");
    expect(via?.label).toBe("✦");

    // On-route pool duplicate (id 1) must not appear twice.
    expect(markers.filter((m) => m.id === 1)).toHaveLength(1);
  });

  it("recolors a recorded stop and highlights the next target", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    act(() => result.current.record("confirm"));

    const markers = result.current.markers;
    expect(markers.find((m) => m.id === 1)?.color).toBe("#16a34a"); // confirmed
    expect(markers.find((m) => m.id === 2)?.color).toBe("#2563eb"); // new target
  });

  it("converts the route to [lat, lon] leaflet coordinates", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    expect(result.current.line).toEqual([
      [0, 0],
      [0, 0.001],
      [0, 0.002],
    ]);
  });

  it("centers on the user when located, else on the target", async () => {
    arm();
    const { result } = renderHook(() => useRunSession());
    expect(result.current.center).toEqual([0, 0.001]); // target before any fix
    expect(result.current.fitPoints).toBeUndefined();

    act(() => h.watchers[0].onPoint({ lat: 0.0001, lon: 0.0001, heading: null }));
    expect(result.current.center).toEqual([0.0001, 0.0001]);
    expect(result.current.fitPoints).toEqual([
      [0.0001, 0.0001],
      [0, 0.001],
    ]);
  });
});

describe("screen wake lifecycle", () => {
  it("keeps the screen awake while armed and releases on unmount", async () => {
    arm();
    const { unmount } = renderHook(() => useRunSession());
    expect(vi.mocked(keepAwake)).toHaveBeenCalledTimes(1);
    unmount();
    expect(vi.mocked(allowSleep)).toHaveBeenCalledTimes(1);
  });

  it("tears down the GPS watch on unmount", async () => {
    arm();
    const { unmount } = renderHook(() => useRunSession());
    await waitFor(() => expect(h.watchers).toHaveLength(1));
    unmount();
    await waitFor(() => expect(h.watchers[0].clear).toHaveBeenCalled());
  });
});
