import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/fountains/route";
import { OverpassError, fetchFountains } from "@/lib/overpass";
import { writeJson } from "@/lib/db";

vi.mock("@/lib/overpass", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/overpass")>();
  // Keep OverpassError real so the route's instanceof branch works.
  return { ...actual, fetchFountains: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  writeJson: vi.fn(async () => {}),
  readJson: vi.fn(),
  appendJson: vi.fn(),
}));

const fetchFountainsMock = vi.mocked(fetchFountains);

function post(body: unknown): Request {
  return new Request("http://test.local/api/fountains", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  lat: 48.85,
  lon: 2.35,
  radiusM: 1500,
  tag: { key: "amenity", value: "drinking_water" },
};

beforeEach(() => {
  fetchFountainsMock.mockResolvedValue([{ id: 1, lat: 48.8, lon: 2.3, tags: {} }]);
});

describe("POST /api/fountains", () => {
  it("rejects an invalid body with the zod error shape", async () => {
    const res = await POST(post({ lat: 48.85 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(fetchFountainsMock).not.toHaveBeenCalled();
  });

  it("fetches with schema defaults applied", async () => {
    const res = await POST(post(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fountains: [{ id: 1, lat: 48.8, lon: 2.3, tags: {} }] });
    expect(fetchFountainsMock).toHaveBeenCalledWith(
      { lat: 48.85, lon: 2.35, radiusM: 1500 },
      { key: "amenity", value: "drinking_water" },
      "any",
      6,
      false,
    );
  });

  it("passes explicit recency + disused options through", async () => {
    await POST(
      post({ ...validBody, recencyMode: "stale", recencyMonths: 12, includeDisused: true }),
    );
    expect(fetchFountainsMock).toHaveBeenCalledWith(
      { lat: 48.85, lon: 2.35, radiusM: 1500 },
      { key: "amenity", value: "drinking_water" },
      "stale",
      12,
      true,
    );
  });

  it("caches the result set best-effort", async () => {
    await POST(post(validBody));
    expect(vi.mocked(writeJson)).toHaveBeenCalledWith(
      "fountains-cache.json",
      expect.objectContaining({
        lat: 48.85,
        lon: 2.35,
        radiusM: 1500,
        fountains: [{ id: 1, lat: 48.8, lon: 2.3, tags: {} }],
      }),
    );
  });

  it("still succeeds when the cache write fails", async () => {
    vi.mocked(writeJson).mockRejectedValueOnce(new Error("disk full"));
    const res = await POST(post(validBody));
    expect(res.status).toBe(200);
  });

  it("maps a retryable Overpass failure to 503", async () => {
    fetchFountainsMock.mockRejectedValueOnce(new OverpassError("server busy", 504, true));
    const res = await POST(post(validBody));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { message: "server busy", retryable: true } });
  });

  it("maps a non-retryable Overpass failure to 502", async () => {
    fetchFountainsMock.mockRejectedValueOnce(new OverpassError("bad query", 400, false));
    const res = await POST(post(validBody));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: { message: "bad query", retryable: false } });
  });

  it("treats unknown errors as non-retryable", async () => {
    fetchFountainsMock.mockRejectedValueOnce(new Error("kaboom"));
    const res = await POST(post(validBody));
    expect(res.status).toBe(502);
    expect((await res.json()).error.retryable).toBe(false);
  });
});
