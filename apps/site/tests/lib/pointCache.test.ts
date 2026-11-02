import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hangingFetch, json, text } from "../helpers/upstream";

// lib/overpass captures OVERPASS_URL at import, so load fresh with a clean env.
let cache: typeof import("@/lib/pointCache");
let overpass: typeof import("@/lib/overpass");
beforeAll(async () => {
  delete process.env.OVERPASS_URL;
  vi.resetModules();
  cache = await import("@/lib/pointCache");
  overpass = await import("@/lib/overpass");
});

let store: ReturnType<typeof import("@/lib/pointCache").memoryCellStore>;
beforeEach(() => {
  store = cache.memoryCellStore();
  cache.useCellStore(store);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  overpass.resetMirrorHealth();
});

const HOUR = 60 * 60 * 1000;
const tag = { key: "amenity", value: "drinking_water" };
const water = (extra: Record<string, string> = {}) => ({ amenity: "drinking_water", ...extra });
const node = (id: number, lat: number, lon: number, tags: Record<string, string> = water()) => ({
  type: "node",
  id,
  lat,
  lon,
  tags,
});

const sentQuery = (fetchMock: ReturnType<typeof vi.fn>, call = 0) =>
  new URLSearchParams(fetchMock.mock.calls[call][1].body as string).get("data") ?? "";
const ids = (r: { fountains: { id: number }[] }) => r.fountains.map((f) => f.id).sort();
const overpassAnswers = (elements: unknown[]) =>
  vi.fn().mockImplementation(async () => json({ elements }));
const rateLimited = () => vi.fn().mockImplementation(async () => text("Too Many Requests", 429));

// One cell: [38.9, -77.1] to [39.0, -77.0].
const inCell = { bounds: [38.91, -77.09, 38.99, -77.01] as [number, number, number, number] };

describe("getPoints — cells", () => {
  it("asks Overpass once for a box of whole cells, then not again within the hour", async () => {
    vi.useFakeTimers();
    const fetchMock = overpassAnswers([node(1, 38.95, -77.05)]);
    vi.stubGlobal("fetch", fetchMock);

    expect(ids(await cache.getPoints(inCell, tag))).toEqual([1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentQuery(fetchMock)).toContain('node["amenity"="drinking_water"](38.9,-77.1,39,-77);');
    // The disused variant is always fetched, so either kind of search can use the cell.
    expect(sentQuery(fetchMock)).toContain('node["disused:amenity"="drinking_water"]');

    vi.advanceTimersByTime(HOUR - 1);
    expect(ids(await cache.getPoints(inCell, tag))).toEqual([1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await cache.getPoints(inCell, tag);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fetches only the box around the cells it is missing", async () => {
    vi.stubGlobal("fetch", overpassAnswers([]));
    await cache.getPoints(inCell, tag);

    const fetchMock = overpassAnswers([]);
    vi.stubGlobal("fetch", fetchMock);
    // Two cells wide: the left one is cached, the right one isn't.
    await cache.getPoints({ bounds: [38.91, -77.09, 38.99, -76.91] }, tag);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentQuery(fetchMock)).toContain("(38.9,-77,39,-76.9);");
  });

  it("keeps a point type's cells apart from another's", async () => {
    vi.stubGlobal("fetch", overpassAnswers([node(1, 38.95, -77.05)]));
    await cache.getPoints(inCell, tag);
    const fetchMock = overpassAnswers([]);
    vi.stubGlobal("fetch", fetchMock);
    await cache.getPoints(inCell, { key: "amenity", value: "bench" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns only points inside a circle, though its cells reach further", async () => {
    vi.stubGlobal(
      "fetch",
      overpassAnswers([node(1, 38.95, -77.05), node(2, 38.95, -77.0505), node(3, 38.99, -77.09)]),
    );
    // 2 is ~43 m from the centre; 3 shares the cell but is ~5.6 km away.
    const r = await cache.getPoints({ lat: 38.95, lon: -77.05, radiusM: 100 }, tag);
    expect(ids(r)).toEqual([1, 2]);
  });

  it("returns only points inside a rectangle", async () => {
    vi.stubGlobal("fetch", overpassAnswers([node(1, 38.95, -77.05), node(2, 38.905, -77.05)]));
    expect(ids(await cache.getPoints(inCell, tag))).toEqual([1]);
  });

  it("drops disused points unless asked for them", async () => {
    vi.stubGlobal(
      "fetch",
      overpassAnswers([
        node(1, 38.95, -77.05),
        node(2, 38.95, -77.05, { "disused:amenity": "drinking_water" }),
      ]),
    );
    expect(ids(await cache.getPoints(inCell, tag))).toEqual([1]);
    expect(ids(await cache.getPoints(inCell, tag, { includeDisused: true }))).toEqual([1, 2]);
  });

  it("applies the recency filter", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.stubGlobal(
      "fetch",
      overpassAnswers([
        node(1, 38.95, -77.05, water({ check_date: today })),
        node(2, 38.95, -77.05, water({ check_date: "2000-01-01" })),
      ]),
    );
    expect(ids(await cache.getPoints(inCell, tag, { recencyMode: "stale" }))).toEqual([2]);
    expect(ids(await cache.getPoints(inCell, tag, { recencyMode: "fresh" }))).toEqual([1]);
  });

  it("places a way by its centre", async () => {
    vi.stubGlobal(
      "fetch",
      overpassAnswers([{ type: "way", id: 9, center: { lat: 38.95, lon: -77.05 }, tags: water() }]),
    );
    expect(await cache.getPoints(inCell, tag)).toMatchObject({
      fountains: [{ id: 9, lat: 38.95, lon: -77.05 }],
    });
  });
});

describe("getPoints — when Overpass fails", () => {
  it("serves older copies, marked stale, once every cell has one", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", overpassAnswers([node(1, 38.95, -77.05)]));
    await cache.getPoints(inCell, tag);
    const fetchedAt = Date.now();

    vi.advanceTimersByTime(3 * HOUR);
    vi.stubGlobal("fetch", rateLimited());
    const r = await cache.getPoints(inCell, tag);
    expect(r).toMatchObject({ stale: true, asOf: fetchedAt });
    expect(ids(r)).toEqual([1]);
  });

  it("fails when some cell has never been fetched", async () => {
    vi.stubGlobal("fetch", overpassAnswers([]));
    await cache.getPoints(inCell, tag);
    vi.stubGlobal("fetch", rateLimited());
    const wider = { bounds: [38.91, -77.09, 38.99, -76.91] as [number, number, number, number] };
    await expect(cache.getPoints(wider, tag)).rejects.toBeInstanceOf(overpass.OverpassError);
  });

  it("still answers from Overpass when the cache itself fails", async () => {
    cache.useCellStore({
      get: async () => {
        throw new Error("cache down");
      },
      set: async () => {
        throw new Error("cache down");
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", overpassAnswers([node(1, 38.95, -77.05)]));
    expect(ids(await cache.getPoints(inCell, tag))).toEqual([1]);
  });
});

describe("getPoints — shared requests", () => {
  it("lets volunteers searching the same area together share one request", async () => {
    let answer!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (answer = r)));
    vi.stubGlobal("fetch", fetchMock);

    const a = cache.getPoints(inCell, tag);
    const b = cache.getPoints(inCell, tag);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    answer(json({ elements: [node(1, 38.95, -77.05)] }));
    expect(ids(await a)).toEqual([1]);
    expect(ids(await b)).toEqual([1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the request going for those still waiting when one leaves", async () => {
    let answer!: (r: Response) => void;
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>((r) => (answer = r));
      }),
    );

    const leaving = new AbortController();
    const a = cache.getPoints(inCell, tag, { signal: leaving.signal });
    const b = cache.getPoints(inCell, tag);
    await vi.waitFor(() => expect(signal).toBeDefined());
    leaving.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    expect(signal?.aborted).toBe(false);

    answer(json({ elements: [node(1, 38.95, -77.05)] }));
    expect(ids(await b)).toEqual([1]);
  });

  it("cancels the request once everyone waiting on it has gone", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const ctrl = new AbortController();
    const a = cache.getPoints(inCell, tag, { signal: ctrl.signal });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    ctrl.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(true);
    // No further mirror is tried for a search nobody is waiting on.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("recordPointWrite", () => {
  it("shows our own edit at once, even after a refresh that doesn't have it yet", async () => {
    vi.useFakeTimers();
    const before = node(1, 38.95, -77.05, water({ check_date: "2020-01-01" }));
    vi.stubGlobal("fetch", overpassAnswers([before]));
    await cache.getPoints(inCell, tag);

    const tags = water({ check_date: "2026-11-02" });
    await cache.recordPointWrite({ id: 1, lat: 38.95, lon: -77.05, tags });
    expect((await cache.getPoints(inCell, tag)).fountains[0].tags).toEqual(tags);

    // An hour on, Overpass still has the old tags.
    vi.advanceTimersByTime(HOUR);
    expect((await cache.getPoints(inCell, tag)).fountains[0].tags).toEqual(tags);

    // A day on, the note has expired and Overpass is trusted again.
    vi.advanceTimersByTime(24 * HOUR);
    expect((await cache.getPoints(inCell, tag)).fountains[0].tags).toEqual(before.tags);
  });

  it("adds a created node and removes a deleted one", async () => {
    vi.stubGlobal("fetch", overpassAnswers([node(1, 38.95, -77.05)]));
    await cache.getPoints(inCell, tag);

    await cache.recordPointWrite({ id: 2, lat: 38.96, lon: -77.06, tags: water() });
    await cache.recordPointWrite({ id: 1, lat: 38.95, lon: -77.05, tags: null });
    expect(ids(await cache.getPoints(inCell, tag))).toEqual([2]);
  });

  it("drops a node from a point type it no longer matches", async () => {
    vi.stubGlobal("fetch", overpassAnswers([node(1, 38.95, -77.05)]));
    await cache.getPoints(inCell, tag);
    await cache.recordPointWrite({
      id: 1,
      lat: 38.95,
      lon: -77.05,
      tags: { "disused:amenity": "drinking_water" },
    });
    expect(ids(await cache.getPoints(inCell, tag))).toEqual([]);
    expect(ids(await cache.getPoints(inCell, tag, { includeDisused: true }))).toEqual([1]);
  });

  it("never touches a way that shares the node's id", async () => {
    vi.stubGlobal(
      "fetch",
      overpassAnswers([{ type: "way", id: 1, center: { lat: 38.95, lon: -77.05 }, tags: water() }]),
    );
    await cache.getPoints(inCell, tag);
    await cache.recordPointWrite({ id: 1, lat: 38.95, lon: -77.05, tags: null });
    expect(ids(await cache.getPoints(inCell, tag))).toEqual([1]);
  });

  it("ignores a write with no usable id", async () => {
    await cache.recordPointWrite({ id: Number.NaN, lat: 38.95, lon: -77.05, tags: water() });
    expect(store.data.size).toBe(0);
  });
});
