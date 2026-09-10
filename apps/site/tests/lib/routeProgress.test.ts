import { describe, expect, it } from "vitest";
import {
  arrivalLengths,
  pointAt,
  routeLengths,
  routePrefix,
  type Route,
} from "@/lib/routeProgress";
import { projectMercator } from "@/lib/basemap/frames";
import { DC_FOUNTAINS, DC_ROUTE } from "@/lib/demoRoute";

// A straight two-point route, west to east along one parallel.
const straight: Route = [
  [38.9, -77.05],
  [38.9, -77.0],
];

const projectedDistance = (a: [number, number], b: [number, number]) => {
  const p = projectMercator(a[1], a[0]);
  const q = projectMercator(b[1], b[0]);
  return Math.hypot(q[0] - p[0], q[1] - p[1]);
};

describe("routeLengths", () => {
  it("starts at zero and ends at the total", () => {
    const { cum, total } = routeLengths(DC_ROUTE);
    expect(cum).toHaveLength(DC_ROUTE.length);
    expect(cum[0]).toBe(0);
    expect(cum[cum.length - 1]).toBe(total);
    expect(total).toBeGreaterThan(0);
  });

  it("is non-decreasing", () => {
    const { cum } = routeLengths(DC_ROUTE);
    for (let i = 1; i < cum.length; i++) expect(cum[i]).toBeGreaterThanOrEqual(cum[i - 1]);
  });

  it("is zero for a route of fewer than two points", () => {
    expect(routeLengths([]).total).toBe(0);
    expect(routeLengths([[38.9, -77]]).total).toBe(0);
  });
});

describe("pointAt", () => {
  const lengths = routeLengths(straight);

  it("returns the ends at and beyond the ends", () => {
    expect(pointAt(straight, lengths, 0)).toEqual(straight[0]);
    expect(pointAt(straight, lengths, -1)).toEqual(straight[0]);
    expect(pointAt(straight, lengths, lengths.total)).toEqual(straight[1]);
    expect(pointAt(straight, lengths, lengths.total * 2)).toEqual(straight[1]);
  });

  it("interpolates within a segment", () => {
    const [lat, lon] = pointAt(straight, lengths, lengths.total / 2);
    expect(lat).toBeCloseTo(38.9, 10);
    expect(lon).toBeCloseTo(-77.025, 10);
  });

  it("walks the real route without leaving it", () => {
    const l = routeLengths(DC_ROUTE);
    // Every vertex is reached exactly at its own cumulative length.
    for (let i = 0; i < DC_ROUTE.length; i += 37) {
      const [lat, lon] = pointAt(DC_ROUTE, l, l.cum[i]);
      expect(lat).toBeCloseTo(DC_ROUTE[i][0], 9);
      expect(lon).toBeCloseTo(DC_ROUTE[i][1], 9);
    }
  });
});

describe("routePrefix", () => {
  const lengths = routeLengths(DC_ROUTE);

  it("is a zero-length line at the start", () => {
    expect(routePrefix(DC_ROUTE, lengths, 0)).toEqual([DC_ROUTE[0], DC_ROUTE[0]]);
    expect(routePrefix(DC_ROUTE, lengths, -5)).toEqual([DC_ROUTE[0], DC_ROUTE[0]]);
  });

  it("is the whole route at and past the end", () => {
    expect(routePrefix(DC_ROUTE, lengths, lengths.total)).toEqual(DC_ROUTE);
    expect(routePrefix(DC_ROUTE, lengths, lengths.total * 3)).toEqual(DC_ROUTE);
  });

  it("ends exactly at the point that far along, on the route's own vertices", () => {
    const at = (lengths.cum[10] + lengths.cum[11]) / 2;
    const prefix = routePrefix(DC_ROUTE, lengths, at);
    expect(prefix.slice(0, 11)).toEqual(DC_ROUTE.slice(0, 11));
    expect(prefix).toHaveLength(12);
    expect(prefix[11]).toEqual(pointAt(DC_ROUTE, lengths, at));
  });

  it("does not repeat a vertex the length lands exactly on", () => {
    const prefix = routePrefix(DC_ROUTE, lengths, lengths.cum[4]);
    expect(prefix).toEqual(DC_ROUTE.slice(0, 5));
  });
});

describe("arrivalLengths", () => {
  const arrivals = arrivalLengths(DC_ROUTE, DC_FOUNTAINS);
  const lengths = routeLengths(DC_ROUTE);

  it("reaches the first stop at the start of the loop, not after a lap", () => {
    // Stop 1 sits where the loop starts and ends; the earlier pass must win.
    expect(arrivals[1]).toBeLessThan(lengths.total * 0.01);
  });

  it("visits the stops in the order they are numbered", () => {
    for (let id = 2; id <= DC_FOUNTAINS.length; id++) {
      expect(arrivals[id]).toBeGreaterThan(arrivals[id - 1]);
    }
    expect(arrivals[DC_FOUNTAINS.length]).toBeLessThan(lengths.total);
  });

  it("lands within a few tens of metres of each fountain", () => {
    // One unit of the Mercator square is the world's circumference at the
    // equator; at DC's latitude 1e-6 of it is roughly 30m. The route is a
    // real GPS trace and a fountain can sit a little way into a park, so
    // this is a sanity bound, not a match.
    for (const f of DC_FOUNTAINS) {
      const on = pointAt(DC_ROUTE, lengths, arrivals[f.id]);
      expect(projectedDistance(on, [f.lat, f.lon])).toBeLessThan(2e-6);
    }
  });

  it("handles a single-point route", () => {
    expect(arrivalLengths([[38.9, -77]], [{ id: 5, lat: 38.9, lon: -77 }])).toEqual({ 5: 0 });
  });
});
