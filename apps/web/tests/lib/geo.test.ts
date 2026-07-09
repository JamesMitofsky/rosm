import { describe, expect, it } from "vitest";
import {
  MILES_TO_M,
  bearing,
  compass,
  fmtDist,
  haversine,
  maneuver,
  metersToMiles,
  milesToMeters,
  nearestCumDistOnPath,
  pathLength,
  toDeg,
  toRad,
} from "@/lib/geo";

// 1 degree of latitude (or of longitude at the equator) on the R=6371000 sphere.
const ONE_DEG_M = (6371000 * Math.PI) / 180; // ≈ 111194.93

describe("toRad / toDeg", () => {
  it("converts degrees to radians and back", () => {
    expect(toRad(180)).toBeCloseTo(Math.PI, 12);
    expect(toRad(0)).toBe(0);
    expect(toDeg(Math.PI)).toBeCloseTo(180, 12);
    expect(toDeg(toRad(37.42))).toBeCloseTo(37.42, 10);
  });
});

describe("mile conversions", () => {
  it("uses the exact international mile", () => {
    expect(milesToMeters(1)).toBe(1609.344);
    expect(metersToMiles(1609.344)).toBe(1);
    expect(MILES_TO_M).toBe(1609.344);
  });

  it("round-trips", () => {
    expect(metersToMiles(milesToMeters(3.7))).toBeCloseTo(3.7, 12);
  });
});

describe("haversine", () => {
  it("is zero for identical points", () => {
    expect(haversine({ lat: 48.85, lon: 2.35 }, { lat: 48.85, lon: 2.35 })).toBe(0);
  });

  it("measures one degree of latitude", () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(ONE_DEG_M, 5);
  });

  it("measures one degree of longitude at the equator", () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(ONE_DEG_M, 5);
  });

  it("shrinks longitude distance with latitude", () => {
    const atEquator = haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    const at60 = haversine({ lat: 60, lon: 0 }, { lat: 60, lon: 1 });
    // Great-circle distance along a parallel is only ~cos-scaled; allow meters of slack.
    expect(at60).toBeCloseTo(atEquator * Math.cos(toRad(60)), -1);
  });

  it("matches the known Paris-London distance", () => {
    const paris = { lat: 48.8566, lon: 2.3522 };
    const london = { lat: 51.5074, lon: -0.1278 };
    const d = haversine(paris, london);
    expect(d).toBeGreaterThan(342_000);
    expect(d).toBeLessThan(345_000);
  });

  it("is symmetric", () => {
    const a = { lat: 40.7, lon: -74 };
    const b = { lat: 34.05, lon: -118.24 };
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 8);
  });

  it("handles antipodal points without NaN (Math.min clamp)", () => {
    const d = haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 180 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeCloseTo(Math.PI * 6371000, 0);
  });
});

describe("bearing", () => {
  const origin = { lat: 0, lon: 0 };

  it("points north", () => {
    expect(bearing(origin, { lat: 1, lon: 0 })).toBeCloseTo(0, 6);
  });

  it("points east", () => {
    expect(bearing(origin, { lat: 0, lon: 1 })).toBeCloseTo(90, 6);
  });

  it("points south", () => {
    expect(bearing(origin, { lat: -1, lon: 0 })).toBeCloseTo(180, 6);
  });

  it("points west", () => {
    expect(bearing(origin, { lat: 0, lon: -1 })).toBeCloseTo(270, 6);
  });

  it("points northeast for a small equal offset", () => {
    expect(bearing(origin, { lat: 0.001, lon: 0.001 })).toBeCloseTo(45, 2);
  });

  it("always returns [0, 360)", () => {
    for (const target of [
      { lat: 1, lon: -1 },
      { lat: -1, lon: -1 },
      { lat: -1, lon: 1 },
    ]) {
      const b = bearing(origin, target);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });
});

describe("compass", () => {
  it.each([
    [0, "N"],
    [45, "NE"],
    [90, "E"],
    [135, "SE"],
    [180, "S"],
    [225, "SW"],
    [270, "W"],
    [315, "NW"],
    [359, "N"],
    [360, "N"],
  ])("labels %d° as %s", (deg, label) => {
    expect(compass(deg)).toBe(label);
  });

  it("switches label at the 22.5° half-sector boundary", () => {
    expect(compass(22.4)).toBe("N");
    expect(compass(22.5)).toBe("NE");
    expect(compass(337.4)).toBe("NW");
    expect(compass(337.5)).toBe("N");
  });
});

describe("fmtDist", () => {
  it("renders meters below 1 km", () => {
    expect(fmtDist(0)).toBe("0 m");
    expect(fmtDist(120.4)).toBe("120 m");
    expect(fmtDist(999.4)).toBe("999 m");
  });

  it("renders miles from 1 km up", () => {
    expect(fmtDist(1000)).toBe("0.62 mi");
    expect(fmtDist(1609.344)).toBe("1.00 mi");
    expect(fmtDist(5000)).toBe("3.11 mi");
  });
});

describe("maneuver", () => {
  it.each([
    [0, "Continue straight"],
    [19.9, "Continue straight"],
    [-19.9, "Continue straight"],
    [20, "Slight right"],
    [-20, "Slight left"],
    [44.9, "Slight right"],
    [45, "Turn right"],
    [-45, "Turn left"],
    [134.9, "Turn right"],
    [135, "Sharp right"],
    [-135, "Sharp left"],
    [159.9, "Sharp right"],
    [160, "U-turn"],
    [-180, "U-turn"],
  ])("maps %d° to %s", (angle, label) => {
    expect(maneuver(angle)).toBe(label);
  });
});

describe("pathLength", () => {
  const a = { lat: 0, lon: 0 };
  const b = { lat: 0, lon: 0.001 };
  const c = { lat: 0.001, lon: 0.001 };
  const leg = ONE_DEG_M / 1000;

  it("is zero for empty or single-point paths", () => {
    expect(pathLength([], false)).toBe(0);
    expect(pathLength([], true)).toBe(0);
    expect(pathLength([a], false)).toBe(0);
    expect(pathLength([a], true)).toBe(0);
  });

  it("sums open-path legs", () => {
    expect(pathLength([a, b, c], false)).toBeCloseTo(2 * leg, 3);
  });

  it("adds the closing leg when looping", () => {
    const open = pathLength([a, b, c], false);
    const closed = pathLength([a, b, c], true);
    expect(closed - open).toBeCloseTo(haversine(c, a), 6);
  });
});

describe("nearestCumDistOnPath", () => {
  // Straight path due east along the equator: [lon, lat] pairs.
  const path: [number, number][] = [
    [0, 0],
    [0.001, 0],
    [0.002, 0],
  ];
  const M_PER_LON = 111320; // module's local equirectangular scale at lat 0

  it("returns 0 for degenerate paths", () => {
    expect(nearestCumDistOnPath([], { lat: 0, lon: 0.001 })).toBe(0);
    expect(nearestCumDistOnPath([[0.001, 0]], { lat: 0, lon: 0.001 })).toBe(0);
  });

  it("projects a point onto the middle of the path", () => {
    // Slightly north of the 3/4 mark; projection lands at lon 0.0015.
    const d = nearestCumDistOnPath(path, { lat: 0.0001, lon: 0.0015 });
    expect(d).toBeCloseTo(0.0015 * M_PER_LON, 0);
  });

  it("clamps before the start to 0", () => {
    expect(nearestCumDistOnPath(path, { lat: 0, lon: -0.01 })).toBe(0);
  });

  it("clamps past the end to the full length", () => {
    const d = nearestCumDistOnPath(path, { lat: 0, lon: 0.05 });
    expect(d).toBeCloseTo(0.002 * M_PER_LON, 0);
  });

  it("survives zero-length segments", () => {
    const withDup: [number, number][] = [
      [0, 0],
      [0.001, 0],
      [0.001, 0],
      [0.002, 0],
    ];
    const d = nearestCumDistOnPath(withDup, { lat: 0, lon: 0.0015 });
    expect(d).toBeCloseTo(0.0015 * M_PER_LON, 0);
  });
});
