import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeTimeoutSignals, hangingFetch, json, text } from "../helpers/upstream";
import { postJson, routeContext } from "../helpers/route";

// lib/overpass captures OVERPASS_URL at import, so load the route fresh with a
// clean env to keep the mirror order deterministic.
let route: typeof import("@/pages/api/fountains");
let cron: typeof import("@/pages/api/cron/warm-points");
let overpass: typeof import("@/lib/overpass");
let cache: typeof import("@/lib/pointCache");
beforeAll(async () => {
  delete process.env.OVERPASS_URL;
  vi.resetModules();
  route = await import("@/pages/api/fountains");
  cron = await import("@/pages/api/cron/warm-points");
  overpass = await import("@/lib/overpass");
  cache = await import("@/lib/pointCache");
});

// Each test starts with an empty cache and every mirror in good standing.
let store: ReturnType<typeof import("@/lib/pointCache").memoryCellStore>;
beforeEach(() => {
  store = cache.memoryCellStore();
  cache.useCellStore(store);
});

afterEach(() => {
  vi.useRealTimers();
  overpass.resetMirrorHealth();
});

const PUBLIC_CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
// What Overpass sends: only points that carry the tag asked for.
const tags = { amenity: "drinking_water", check_date: "2026-01-01" };
const elements = [{ type: "node", id: 1, lat: 38.9, lon: -77.03, tags }];

const get = (query: string, init?: RequestInit) =>
  route.GET(routeContext(new Request(`https://waterrun.app/api/fountains${query}`, init)));
const post = (body: unknown) =>
  route.POST(routeContext(postJson("https://waterrun.app/api/fountains", body)));

const sentQuery = (fetchMock: ReturnType<typeof vi.fn>, call = 0) =>
  new URLSearchParams(fetchMock.mock.calls[call][1].body as string).get("data") ?? "";

describe("GET /api/fountains", () => {
  it("answers the DC region with a CDN-cacheable list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ elements }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await get("?region=dc");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC_CACHE);
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(await res.json()).toEqual({
      fountains: [{ id: 1, lat: 38.9, lon: -77.03, tags }],
      stale: false,
      asOf: expect.any(String),
    });
  });

  it("asks Overpass for what the public map shows: drinking water, in service or not", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ elements: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await get("?region=dc");
    const q = sentQuery(fetchMock);
    // The DC frame, widened to whole 0.1° cache cells.
    expect(q).toContain('node["amenity"="drinking_water"](38.7,-77.4,39.1,-76.7);');
    expect(q).toContain('node["disused:amenity"="drinking_water"]');
  });

  it("refuses any other region without calling Overpass", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const query of ["?region=nyc", "?region=", ""]) {
      const res = await get(query);
      expect(res.status).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect((await res.json()).error.retryable).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports rate limiting on every mirror as an uncached, retryable 503", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => text("Too Many Requests", 429)),
    );

    const res = await get("?region=dc");
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.error.retryable).toBe(true);
    expect(body.error.message).toContain("rate limiting");
  });

  it("gives up with a 504 inside the web client's 20 s wait when Overpass hangs", async () => {
    vi.useFakeTimers();
    fakeTimeoutSignals();
    vi.stubGlobal("fetch", hangingFetch());

    const started = Date.now();
    const p = get("?region=dc");
    await vi.advanceTimersByTimeAsync(15_000);
    const res = await p;
    expect(Date.now() - started).toBeLessThanOrEqual(15_000);
    expect(res.status).toBe(504);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await res.json()).error.retryable).toBe(true);
  });

  it("falls back to the next mirror inside the deadline when the first one hangs", async () => {
    vi.useFakeTimers();
    fakeTimeoutSignals();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(hangingFetch())
      .mockResolvedValueOnce(json({ elements }));
    vi.stubGlobal("fetch", fetchMock);

    const started = Date.now();
    const p = get("?region=dc");
    await vi.advanceTimersByTimeAsync(7_000);
    const res = await p;
    expect(Date.now() - started).toBeLessThanOrEqual(7_000);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC_CACHE);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ]);
  });

  it("stops calling Overpass once the visitor has gone", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const ctrl = new AbortController();

    const p = get("?region=dc", { signal: ctrl.signal });
    ctrl.abort();
    const res = await p;
    expect(res.status).toBe(502);
    // At most the request already under way; no further mirror.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe("POST /api/fountains", () => {
  const search = {
    lat: 38.9,
    lon: -77,
    radiusM: 100,
    tag: { key: "amenity", value: "drinking_water" },
  };

  it("searches for a point type the app offers", async () => {
    // ~40 m from the search centre, inside its 100 m.
    const near = [{ type: "node", id: 2, lat: 38.9, lon: -77.0005, tags }];
    const fetchMock = vi.fn().mockResolvedValue(json({ elements: [...elements, ...near] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await post(search);
    expect(res.status).toBe(200);
    // Point 1 is in a fetched cell but 2.6 km away, outside the circle.
    expect((await res.json()).fountains.map((f: { id: number }) => f.id)).toEqual([2]);
    // The cache cells around the circle, fetched as one box.
    expect(sentQuery(fetchMock)).toContain(
      'node["amenity"="drinking_water"](38.8,-77.1,39,-76.9);',
    );
  });

  it("refuses a tag that tries to rewrite the query, before it reaches Overpass", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await post({
      ...search,
      tag: { key: "amenity", value: 'x"];node(-90,-180,90,180);out;//' },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { message: "Unsupported point type", retryable: false },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a well-formed tag that no client offers", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await post({ ...search, tag: { key: "building", value: "yes" } });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers a body that isn't JSON with a 400, not a crash", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });

  it("does not cache a fresh search", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ elements: [] })));
    const res = await post(search);
    expect(res.headers.get("Cache-Control")).toBeNull();
  });
});

describe("GET /api/fountains — when Overpass goes down", () => {
  it("serves the last copy, marked stale and held only briefly by the CDN", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ elements })));
    const first = await get("?region=dc");
    expect((await first.json()).stale).toBe(false);

    // Two hours on the copy is due a refresh, and every mirror refuses.
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => text("Too Many Requests", 429)),
    );
    const res = await get("?region=dc");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, s-maxage=60");
    const body = await res.json();
    expect(body.stale).toBe(true);
    expect(body.fountains.map((f: { id: number }) => f.id)).toEqual([1]);
  });

  it("answers from the cache without asking Overpass while the copy is fresh", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ elements })));
    await get("?region=dc");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await get("?region=dc");
    expect(res.status).toBe(200);
    expect((await res.json()).fountains).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/warm-points", () => {
  const call = (auth?: string) =>
    cron.GET(
      routeContext(
        new Request("https://waterrun.app/api/cron/warm-points", {
          headers: auth ? { authorization: auth } : {},
        }),
      ),
    );

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("refuses a call without the cron secret, and every call when none is set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await call("Bearer anything")).status).toBe(401);
    process.env.CRON_SECRET = "s3cret";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fills the DC cells the public map and Nearby read", async () => {
    process.env.CRON_SECRET = "s3cret";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ elements })));
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ count: 1, stale: false });

    // The public map is now answered without Overpass.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await (await get("?region=dc")).json()).fountains).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
