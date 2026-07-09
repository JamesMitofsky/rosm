import { beforeEach, describe, expect, it, vi } from "vitest";

// All four wrappers guard on isNative() and lazy-import their Capacitor plugin;
// several cache module-level state (notify's permission grant, liveActivity's
// plugin handle), so each test imports a fresh module copy.
const h = vi.hoisted(() => ({
  native: { value: false },
  share: vi.fn(async () => {}),
  keepAwake: vi.fn(async () => {}),
  allowSleep: vi.fn(async () => {}),
  requestPermissions: vi.fn(async () => ({ display: "granted" })),
  checkPermissions: vi.fn(async () => ({ display: "granted" })),
  schedule: vi.fn(async () => {}),
  registerPlugin: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ isNative: () => h.native.value }));
vi.mock("@capacitor/share", () => ({ Share: { share: h.share } }));
vi.mock("@capacitor-community/keep-awake", () => ({
  KeepAwake: { keepAwake: h.keepAwake, allowSleep: h.allowSleep },
}));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    requestPermissions: h.requestPermissions,
    checkPermissions: h.checkPermissions,
    schedule: h.schedule,
  },
}));
vi.mock("@capacitor/core", () => ({ registerPlugin: h.registerPlugin }));

beforeEach(() => {
  h.native.value = false;
  vi.resetModules();
});

describe("share", () => {
  it("offers sharing on native regardless of the Web Share API", async () => {
    const { canShare } = await import("@/lib/share");
    h.native.value = true;
    expect(canShare()).toBe(true);
  });

  it("offers sharing on web only where navigator.share exists", async () => {
    const { canShare } = await import("@/lib/share");
    expect(canShare()).toBe(false); // node/jsdom has no navigator.share
    vi.stubGlobal("navigator", { share: vi.fn() });
    expect(canShare()).toBe(true);
  });

  it("shares through the Capacitor plugin", async () => {
    const { shareRun } = await import("@/lib/share");
    await shareRun("https://rosm.test/run", "I surveyed 5 fountains");
    expect(h.share).toHaveBeenCalledWith({
      title: "ROSM run",
      text: "I surveyed 5 fountains",
      url: "https://rosm.test/run",
    });
  });

  it("swallows a cancelled share", async () => {
    const { shareRun } = await import("@/lib/share");
    h.share.mockRejectedValueOnce(new Error("cancelled"));
    await expect(shareRun("u", "t")).resolves.toBeUndefined();
  });
});

describe("keepAwake", () => {
  it("is a no-op on web", async () => {
    const mod = await import("@/lib/keepAwake");
    await mod.keepAwake();
    await mod.allowSleep();
    expect(h.keepAwake).not.toHaveBeenCalled();
    expect(h.allowSleep).not.toHaveBeenCalled();
  });

  it("drives the plugin on native", async () => {
    h.native.value = true;
    const mod = await import("@/lib/keepAwake");
    await mod.keepAwake();
    await mod.allowSleep();
    expect(h.keepAwake).toHaveBeenCalledTimes(1);
    expect(h.allowSleep).toHaveBeenCalledTimes(1);
  });

  it("never throws when the plugin fails", async () => {
    h.native.value = true;
    h.keepAwake.mockRejectedValueOnce(new Error("no screen"));
    const mod = await import("@/lib/keepAwake");
    await expect(mod.keepAwake()).resolves.toBeUndefined();
  });
});

describe("notify", () => {
  it("reports no permission on web and never schedules", async () => {
    const mod = await import("@/lib/notify");
    expect(await mod.ensureNotifyPermission()).toBe(false);
    await mod.notifyProximity("Fountain", 55);
    expect(h.schedule).not.toHaveBeenCalled();
  });

  it("asks once, then re-checks silently", async () => {
    h.native.value = true;
    const mod = await import("@/lib/notify");
    expect(await mod.ensureNotifyPermission()).toBe(true);
    expect(await mod.ensureNotifyPermission()).toBe(true);
    expect(h.requestPermissions).toHaveBeenCalledTimes(1);
    expect(h.checkPermissions).toHaveBeenCalledTimes(1);
  });

  it("schedules a proximity alert with rounded distance on a fixed id", async () => {
    h.native.value = true;
    const mod = await import("@/lib/notify");
    await mod.ensureNotifyPermission();
    await mod.notifyProximity("Fountain X", 81.7);
    expect(h.schedule).toHaveBeenCalledWith({
      notifications: [
        {
          id: 200,
          title: "Survey point ahead",
          body: "Fountain X — about 82 m away.",
        },
      ],
    });
  });

  it("pluralizes the completion notice", async () => {
    h.native.value = true;
    const mod = await import("@/lib/notify");
    await mod.ensureNotifyPermission();
    await mod.notifyRunComplete(1);
    await mod.notifyRunComplete(3);
    const bodies = (
      h.schedule.mock.calls as unknown as [{ notifications: { id: number; body: string }[] }][]
    ).map((c) => c[0].notifications[0]);
    expect(bodies[0].id).toBe(201);
    expect(bodies[0].body).toContain("1 point.");
    expect(bodies[1].body).toContain("3 points.");
  });

  it("stays silent when permission is denied", async () => {
    h.native.value = true;
    h.requestPermissions.mockResolvedValueOnce({ display: "denied" });
    h.checkPermissions.mockResolvedValue({ display: "denied" });
    const mod = await import("@/lib/notify");
    expect(await mod.ensureNotifyPermission()).toBe(false);
    await mod.notifyProximity("F", 40);
    expect(h.schedule).not.toHaveBeenCalled();
  });
});

describe("liveActivity", () => {
  const state = { nextName: "F", distanceToNext: 100, stopsRemaining: 2, totalStops: 5 };

  it("no-ops entirely on web", async () => {
    const mod = await import("@/lib/liveActivity");
    await mod.startRunActivity(state);
    await mod.updateRunActivity(state);
    await mod.endRunActivity();
    expect(h.registerPlugin).not.toHaveBeenCalled();
  });

  it("registers the RunActivity plugin once and delegates", async () => {
    h.native.value = true;
    const plugin = {
      start: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      end: vi.fn(async () => {}),
    };
    h.registerPlugin.mockReturnValue(plugin);

    const mod = await import("@/lib/liveActivity");
    await mod.startRunActivity(state);
    await mod.updateRunActivity({ ...state, distanceToNext: 75 });
    await mod.endRunActivity();

    expect(h.registerPlugin).toHaveBeenCalledTimes(1);
    expect(h.registerPlugin).toHaveBeenCalledWith("RunActivity");
    expect(plugin.start).toHaveBeenCalledWith(state);
    expect(plugin.update).toHaveBeenCalledWith({ ...state, distanceToNext: 75 });
    expect(plugin.end).toHaveBeenCalledTimes(1);
  });

  it("stays safe when the native plugin is missing", async () => {
    h.native.value = true;
    h.registerPlugin.mockImplementation(() => {
      throw new Error("plugin not installed");
    });
    const mod = await import("@/lib/liveActivity");
    await expect(mod.startRunActivity(state)).resolves.toBeUndefined();
    await expect(mod.endRunActivity()).resolves.toBeUndefined();
  });

  it("swallows plugin call failures", async () => {
    h.native.value = true;
    h.registerPlugin.mockReturnValue({
      start: vi.fn(async () => {
        throw new Error("widget missing");
      }),
      update: vi.fn(),
      end: vi.fn(),
    });
    const mod = await import("@/lib/liveActivity");
    await expect(mod.startRunActivity(state)).resolves.toBeUndefined();
  });
});
