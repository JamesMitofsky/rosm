import { afterEach, describe, expect, it, vi } from "vitest";
import { hapticSuccess } from "@/lib/haptics";
import { canShare, shareRun } from "@/lib/share";
import { keepAwake, allowSleep } from "@/lib/keepAwake";
import { ensureNotifyPermission, notifyProximity, notifyRunComplete } from "@/lib/notify";
import { startRunActivity, updateRunActivity, endRunActivity } from "@/lib/liveActivity";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("haptics", () => {
  it("buzzes via the Vibration API when available", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    hapticSuccess();
    expect(vibrate).toHaveBeenCalledWith(35);
  });

  it("is a no-op when vibrate is unavailable", () => {
    vi.stubGlobal("navigator", {});
    expect(() => hapticSuccess()).not.toThrow();
  });
});

describe("share", () => {
  it("offers sharing only where the Web Share API exists", () => {
    vi.stubGlobal("navigator", { share: vi.fn() });
    expect(canShare()).toBe(true);
    vi.stubGlobal("navigator", {});
    expect(canShare()).toBe(false);
  });

  it("shares through the Web Share API", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    await shareRun("https://osm.test/cs/1", "Surveyed 3 points");
    expect(share).toHaveBeenCalledWith({
      title: "ROSM run",
      text: "Surveyed 3 points",
      url: "https://osm.test/cs/1",
    });
  });

  it("swallows a cancelled/failed share", async () => {
    const share = vi.fn().mockRejectedValue(new Error("cancelled"));
    vi.stubGlobal("navigator", { share });
    await expect(shareRun("u", "t")).resolves.toBeUndefined();
  });
});

describe("keepAwake", () => {
  it("acquires and releases a screen wake lock", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    vi.stubGlobal("navigator", { wakeLock: { request } });

    await keepAwake();
    expect(request).toHaveBeenCalledWith("screen");

    await allowSleep();
    expect(release).toHaveBeenCalled();
  });

  it("never throws where wake lock is unsupported", async () => {
    vi.stubGlobal("navigator", {});
    await expect(keepAwake()).resolves.toBeUndefined();
    await expect(allowSleep()).resolves.toBeUndefined();
  });
});

describe("notify (web no-ops)", () => {
  it("reports no notification permission", async () => {
    expect(await ensureNotifyPermission()).toBe(false);
  });

  it("never throws", () => {
    expect(() => notifyProximity("Fountain X", 42)).not.toThrow();
    expect(() => notifyRunComplete(3)).not.toThrow();
  });
});

describe("liveActivity (web no-ops)", () => {
  it("resolves without throwing", async () => {
    const state = { nextName: "X", distanceToNext: 10, stopsRemaining: 2, totalStops: 5 };
    await expect(startRunActivity(state)).resolves.toBeUndefined();
    await expect(updateRunActivity(state)).resolves.toBeUndefined();
    await expect(endRunActivity()).resolves.toBeUndefined();
  });
});
