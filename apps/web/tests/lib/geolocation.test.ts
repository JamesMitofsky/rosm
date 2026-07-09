import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentPosition, watchPosition, watchRunPosition } from "@/lib/geolocation";
import type { GeoPoint } from "@/lib/geolocation";

type SuccessCb = (pos: { coords: Record<string, number | null> }) => void;
type ErrorCb = (err: { message: string }) => void;

const geo = {
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
  getCurrentPosition: vi.fn(),
};

beforeEach(() => {
  geo.watchPosition.mockReset();
  geo.clearWatch.mockReset();
  geo.getCurrentPosition.mockReset();
  vi.stubGlobal("navigator", { geolocation: geo });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("watchPosition", () => {
  it("maps coords, keeping heading only when finite", async () => {
    let success!: SuccessCb;
    geo.watchPosition.mockImplementation((ok: SuccessCb) => {
      success = ok;
      return 1;
    });

    const points: GeoPoint[] = [];
    await watchPosition(
      (p) => points.push(p),
      () => {},
    );

    success({ coords: { latitude: 48.8, longitude: 2.3, heading: 90, accuracy: 5 } });
    success({ coords: { latitude: 48.9, longitude: 2.4, heading: NaN, accuracy: null } });
    success({ coords: { latitude: 49.0, longitude: 2.5, heading: null, accuracy: 7 } });

    expect(points).toEqual([
      { lat: 48.8, lon: 2.3, heading: 90, accuracy: 5 },
      { lat: 48.9, lon: 2.4, heading: null, accuracy: undefined },
      { lat: 49.0, lon: 2.5, heading: null, accuracy: 7 },
    ]);
  });

  it("routes errors to onError", async () => {
    let error!: ErrorCb;
    geo.watchPosition.mockImplementation((_ok: SuccessCb, err: ErrorCb) => {
      error = err;
      return 1;
    });

    const errors: string[] = [];
    await watchPosition(
      () => {},
      (m) => errors.push(m),
    );
    error({ message: "denied" });
    expect(errors).toEqual(["denied"]);
  });

  it("clears the underlying watch", async () => {
    geo.watchPosition.mockReturnValue(9);
    const watch = await watchPosition(
      () => {},
      () => {},
    );
    watch.clear();
    expect(geo.clearWatch).toHaveBeenCalledWith(9);
  });

  it("defaults to high accuracy", async () => {
    geo.watchPosition.mockReturnValue(1);
    await watchPosition(
      () => {},
      () => {},
    );
    expect(geo.watchPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: true,
      maximumAge: 5000,
    });
  });
});

describe("watchRunPosition", () => {
  it("uses the foreground browser watch", async () => {
    geo.watchPosition.mockReturnValue(1);
    await watchRunPosition(
      () => {},
      () => {},
    );
    expect(geo.watchPosition).toHaveBeenCalled();
  });
});

describe("getCurrentPosition", () => {
  it("maps the one-shot fix", async () => {
    geo.getCurrentPosition.mockImplementation((ok: SuccessCb) =>
      ok({ coords: { latitude: 48.8, longitude: 2.3, heading: null, accuracy: 10 } }),
    );

    expect(await getCurrentPosition()).toEqual({
      lat: 48.8,
      lon: 2.3,
      heading: null,
      accuracy: 10,
    });
  });
});
