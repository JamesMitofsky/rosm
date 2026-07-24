import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The module captures OVERPASS_URL and the mirror list at import time, so load it
// fresh with a guaranteed-clean env to keep the endpoint order deterministic.
let mod: typeof import("@/lib/overpass");
beforeAll(async () => {
  delete process.env.OVERPASS_URL;
  vi.resetModules();
  mod = await import("@/lib/overpass");
});

afterEach(() => {
  vi.useRealTimers();
});

const tag = { key: "amenity", value: "drinking_water" };

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const errText = (status: number, body = "err") => new Response(body, { status });

describe("buildQuery", () => {
  it("targets nodes, ways and relations for the tag within a rounded radius", () => {
    const q = mod.buildQuery({ lat: 48.85, lon: 2.35, radiusM: 123.7 }, tag);
    expect(q).toContain("[out:json][timeout:25];");
    expect(q).toContain('node["amenity"="drinking_water"](around:124,48.85,2.35);');
    expect(q).toContain('way["amenity"="drinking_water"](around:124,48.85,2.35);');
    expect(q).toContain('relation["amenity"="drinking_water"](around:124,48.85,2.35);');
    expect(q).toContain("out center tags;");
    expect(q).not.toContain("disused:");
  });

  it("targets a bbox rectangle when bounds are given", () => {
    const q = mod.buildQuery({ bounds: [48.8, 2.3, 48.9, 2.4] }, tag);
    expect(q).toContain('node["amenity"="drinking_water"](48.8,2.3,48.9,2.4);');
    expect(q).toContain('way["amenity"="drinking_water"](48.8,2.3,48.9,2.4);');
    expect(q).toContain('relation["amenity"="drinking_water"](48.8,2.3,48.9,2.4);');
    expect(q).not.toContain("around:");
  });

  it("adds the disused selector when includeDisused is set, but never abandoned/removed", () => {
    const q = mod.buildQuery({ lat: 48.85, lon: 2.35, radiusM: 500 }, tag, true);
    expect(q).toContain('node["disused:amenity"="drinking_water"]');
    // Removed points (abandoned:) are never surfaced, so they're never fetched.
    expect(q).not.toContain("abandoned:");
    // 3 element kinds × 2 prefixes.
    expect(q.match(/\(around:/g)).toHaveLength(6);
  });
});

describe("fetchFountains — element mapping", () => {
  it("maps nodes and way/relation centers, dropping coordinate-less elements", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okJson({
        elements: [
          { type: "node", id: 1, lat: 48.1, lon: 2.1, tags: { name: "A" } },
          { type: "way", id: 2, center: { lat: 48.2, lon: 2.2 }, tags: { name: "B" } },
          { type: "relation", id: 3, tags: { name: "no coords" } },
          { type: "node", id: 4, lat: 48.4, lon: 2.4 }, // no tags
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const fountains = await mod.fetchFountains({ lat: 48.85, lon: 2.35, radiusM: 500 }, tag);
    expect(fountains).toEqual([
      { id: 1, lat: 48.1, lon: 2.1, tags: { name: "A" } },
      { id: 2, lat: 48.2, lon: 2.2, tags: { name: "B" } },
      { id: 4, lat: 48.4, lon: 2.4, tags: {} },
    ]);

    // Request shape: primary mirror, urlencoded POST carrying the query verbatim.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://overpass-api.de/api/interpreter");
    expect(init.method).toBe("POST");
    expect(init.headers["User-Agent"]).toContain("run-for-maps");
    const sent = new URLSearchParams(init.body as string).get("data");
    expect(sent).toBe(mod.buildQuery({ lat: 48.85, lon: 2.35, radiusM: 500 }, tag));
  });

  it("applies the recency filter server-side of the API route", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const elements = [
      { type: "node", id: 1, lat: 1, lon: 1, tags: { check_date: today } }, // fresh
      { type: "node", id: 2, lat: 2, lon: 2, tags: { check_date: "2000-01-01" } }, // stale
      { type: "node", id: 3, lat: 3, lon: 3, tags: {} }, // never surveyed
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson({ elements }))
      .mockResolvedValueOnce(okJson({ elements }))
      .mockResolvedValueOnce(okJson({ elements }));
    vi.stubGlobal("fetch", fetchMock);

    const region = { lat: 0, lon: 0, radiusM: 500 };
    const stale = await mod.fetchFountains(region, tag, "stale", 6);
    expect(stale.map((x) => x.id)).toEqual([2, 3]);

    const fresh = await mod.fetchFountains(region, tag, "fresh", 6);
    expect(fresh.map((x) => x.id)).toEqual([1]);

    const any = await mod.fetchFountains(region, tag, "any", 6);
    expect(any.map((x) => x.id)).toEqual([1, 2, 3]);
  });
});

describe("fetchFountains — retries and mirror fallback", () => {
  it("falls through to the next mirror after retryable failures", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errText(504))
      .mockResolvedValueOnce(errText(504))
      .mockResolvedValueOnce(okJson({ elements: [{ type: "node", id: 7, lat: 1, lon: 1 }] }));
    vi.stubGlobal("fetch", fetchMock);

    const p = mod.fetchFountains({ lat: 0, lon: 0, radiusM: 500 }, tag);
    await vi.runAllTimersAsync();
    const fountains = await p;

    expect(fountains.map((x) => x.id)).toEqual([7]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Two attempts on the primary, then the first fallback mirror.
    expect(fetchMock.mock.calls[0][0]).toBe("https://overpass-api.de/api/interpreter");
    expect(fetchMock.mock.calls[1][0]).toBe("https://overpass-api.de/api/interpreter");
    expect(fetchMock.mock.calls[2][0]).toBe("https://overpass.kumi.systems/api/interpreter");
  });

  it("throws immediately on a non-retryable status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errText(400, "bad query"));
    vi.stubGlobal("fetch", fetchMock);

    const err = await mod.fetchFountains({ lat: 0, lon: 0, radiusM: 500 }, tag).catch((e) => e);
    expect(err).toBeInstanceOf(mod.OverpassError);
    expect(err.retryable).toBe(false);
    expect(err.status).toBe(400);
    expect(err.message).toContain("(400)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exhausts every mirror on rate limiting and reports a human message", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => errText(429, "Too Many Requests"));
    vi.stubGlobal("fetch", fetchMock);

    const p = mod.fetchFountains({ lat: 0, lon: 0, radiusM: 500 }, tag);
    const assertion = expect(p).rejects.toMatchObject({
      name: "OverpassError",
      retryable: true,
      status: 429,
      message: expect.stringContaining("rate limiting"),
    });
    await vi.runAllTimersAsync();
    await assertion;
    // 2 attempts × 3 mirrors.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("maps request timeouts to a took-too-long message", async () => {
    vi.useFakeTimers();
    const abortErr = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
    const fetchMock = vi.fn().mockRejectedValue(abortErr);
    vi.stubGlobal("fetch", fetchMock);

    const p = mod.fetchFountains({ lat: 0, lon: 0, radiusM: 500 }, tag);
    const assertion = expect(p).rejects.toMatchObject({
      retryable: true,
      status: null,
      message: expect.stringContaining("took too long"),
    });
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("maps network failures to a connectivity message", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const p = mod.fetchFountains({ lat: 0, lon: 0, radiusM: 500 }, tag);
    const assertion = expect(p).rejects.toMatchObject({
      retryable: true,
      message: expect.stringContaining("Check your connection"),
    });
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("labels an overloaded server as busy", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => errText(504, "gateway timeout"));
    vi.stubGlobal("fetch", fetchMock);

    const p = mod.fetchFountains({ lat: 0, lon: 0, radiusM: 500 }, tag);
    const assertion = expect(p).rejects.toMatchObject({
      message: expect.stringContaining("busy right now"),
    });
    await vi.runAllTimersAsync();
    await assertion;
  });
});
