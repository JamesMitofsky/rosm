import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentPosition, watchPosition, watchRunPosition } from "@/lib/geolocation";
import { Geolocation } from "@capacitor/geolocation";
import { registerPlugin } from "@capacitor/core";
import type { GeoPoint } from "@/lib/geolocation";

let native = false;

vi.mock("@/lib/api", () => ({
  isNative: () => native,
}));

vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  },
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: vi.fn(),
}));

type WatchCb = (
  pos: { coords: Record<string, number | null> } | undefined,
  err?: { message?: string },
) => void;

beforeEach(() => {
  native = false;
});

describe("watchPosition (foreground)", () => {
  it("maps coords, keeping heading and speed only when finite", async () => {
    let cb!: WatchCb;
    vi.mocked(Geolocation.watchPosition).mockImplementation(async (_opts, callback) => {
      cb = callback as WatchCb;
      return "watch-1";
    });

    const points: GeoPoint[] = [];
    await watchPosition(
      (p) => points.push(p),
      () => {},
    );

    cb({ coords: { latitude: 48.8, longitude: 2.3, heading: 90, speed: 1.5, accuracy: 5 } });
    cb({ coords: { latitude: 48.9, longitude: 2.4, heading: NaN, speed: NaN, accuracy: null } });
    cb({ coords: { latitude: 49.0, longitude: 2.5, heading: null } });

    expect(points).toEqual([
      { lat: 48.8, lon: 2.3, heading: 90, speed: 1.5, accuracy: 5 },
      { lat: 48.9, lon: 2.4, heading: null, speed: null, accuracy: undefined },
      { lat: 49.0, lon: 2.5, heading: null, speed: null, accuracy: undefined },
    ]);
  });

  it("routes plugin errors to onError", async () => {
    let cb!: WatchCb;
    vi.mocked(Geolocation.watchPosition).mockImplementation(async (_opts, callback) => {
      cb = callback as WatchCb;
      return "watch-1";
    });

    const errors: string[] = [];
    await watchPosition(
      () => {},
      (m) => errors.push(m),
    );
    cb(undefined, { message: "denied" });
    expect(errors).toEqual(["denied"]);
  });

  it("clears the underlying watch", async () => {
    vi.mocked(Geolocation.watchPosition).mockResolvedValue("watch-9");
    const watch = await watchPosition(
      () => {},
      () => {},
    );
    watch.clear();
    expect(vi.mocked(Geolocation.clearWatch)).toHaveBeenCalledWith({ id: "watch-9" });
  });

  it("defaults to high accuracy", async () => {
    vi.mocked(Geolocation.watchPosition).mockResolvedValue("w");
    await watchPosition(
      () => {},
      () => {},
    );
    expect(vi.mocked(Geolocation.watchPosition).mock.calls[0][0]).toEqual({
      enableHighAccuracy: true,
      maximumAge: 5000,
    });
  });
});

describe("watchRunPosition", () => {
  it("uses the foreground watch on the web", async () => {
    vi.mocked(Geolocation.watchPosition).mockResolvedValue("w");
    await watchRunPosition(
      () => {},
      () => {},
    );
    expect(vi.mocked(Geolocation.watchPosition)).toHaveBeenCalled();
    expect(vi.mocked(registerPlugin)).not.toHaveBeenCalled();
  });

  it("uses background geolocation on native, mapping bearing to heading", async () => {
    native = true;
    type BgCb = (
      loc?: {
        latitude: number;
        longitude: number;
        bearing?: number | null;
        speed?: number | null;
        accuracy?: number;
      },
      err?: { message?: string },
    ) => void;
    let bgCb!: BgCb;
    const addWatcher = vi.fn(async (_opts: unknown, cb: BgCb) => {
      bgCb = cb;
      return "bg-1";
    });
    const removeWatcher = vi.fn();
    vi.mocked(registerPlugin).mockReturnValue({ addWatcher, removeWatcher } as never);

    const points: GeoPoint[] = [];
    const errors: string[] = [];
    const watch = await watchRunPosition(
      (p) => points.push(p),
      (m) => errors.push(m),
    );

    // Requests permissions and keeps tracking distance-filtered in the background.
    expect(addWatcher.mock.calls[0][0]).toMatchObject({
      requestPermissions: true,
      stale: false,
      distanceFilter: 5,
    });

    bgCb({ latitude: 1, longitude: 2, bearing: 45, speed: 2, accuracy: 3 });
    bgCb({ latitude: 3, longitude: 4 }); // stationary: no bearing/speed
    bgCb(undefined, { message: "bg denied" });

    expect(points).toEqual([
      { lat: 1, lon: 2, heading: 45, speed: 2, accuracy: 3 },
      { lat: 3, lon: 4, heading: null, speed: null, accuracy: undefined },
    ]);
    expect(errors).toEqual(["bg denied"]);

    watch.clear();
    expect(removeWatcher).toHaveBeenCalledWith({ id: "bg-1" });
  });
});

describe("getCurrentPosition", () => {
  it("maps the one-shot fix", async () => {
    vi.mocked(Geolocation.getCurrentPosition).mockResolvedValue({
      coords: { latitude: 48.8, longitude: 2.3, heading: null, speed: null, accuracy: 10 },
    } as never);

    expect(await getCurrentPosition()).toEqual({
      lat: 48.8,
      lon: 2.3,
      heading: null,
      speed: null,
      accuracy: 10,
    });
  });
});
