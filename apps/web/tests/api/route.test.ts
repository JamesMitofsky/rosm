import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/route/route";
import { RouteError, footRoute } from "@/lib/brouter";

vi.mock("@/lib/brouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brouter")>();
  return { ...actual, footRoute: vi.fn() };
});

const footRouteMock = vi.mocked(footRoute);

function post(body: unknown): Request {
  return new Request("http://test.local/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const points = [
  { lat: 0, lon: 0 },
  { lat: 0, lon: 0.001 },
];

describe("POST /api/route", () => {
  it("rejects fewer than two waypoints", async () => {
    const res = await POST(post({ points: [points[0]], loop: false }));
    expect(res.status).toBe(400);
    expect(footRouteMock).not.toHaveBeenCalled();
  });

  it("returns the routed geometry, distance and turns", async () => {
    const route = {
      coords: [
        [0, 0],
        [0.001, 0],
      ] as [number, number][],
      distanceM: 111,
      turns: [{ lat: 0, lon: 0.001, distM: 111, angle: 90 }],
    };
    footRouteMock.mockResolvedValueOnce(route);

    const res = await POST(post({ points, loop: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(route);
    expect(footRouteMock).toHaveBeenCalledWith(points, true);
  });

  it("maps an island failure to 502 with the unreachable point attached", async () => {
    footRouteMock.mockRejectedValueOnce(
      new RouteError("A point on your route can't be reached on foot", {
        lat: 0,
        lon: 0.001,
      }),
    );

    const res = await POST(post({ points, loop: false }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "A point on your route can't be reached on foot",
      island: { lat: 0, lon: 0.001 },
    });
  });

  it("maps other routing failures to 502 without an island", async () => {
    footRouteMock.mockRejectedValueOnce(new RouteError("Routing failed (BRouter 500)."));
    const res = await POST(post({ points, loop: false }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toContain("Routing failed");
    expect(json.island).toBeUndefined();
  });
});
