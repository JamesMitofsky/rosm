import { afterEach, describe, expect, it, vi } from "vitest";
import { queryGeoPermission } from "@/lib/geoPermission";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("queryGeoPermission", () => {
  it("reports the Permissions API state when it answers", async () => {
    for (const state of ["granted", "prompt", "denied"] as const) {
      vi.stubGlobal("navigator", {
        permissions: { query: vi.fn().mockResolvedValue({ state }) },
      });
      expect(await queryGeoPermission()).toBe(state);
    }
  });

  it("asks specifically about geolocation", async () => {
    const query = vi.fn().mockResolvedValue({ state: "granted" });
    vi.stubGlobal("navigator", { permissions: { query } });
    await queryGeoPermission();
    expect(query).toHaveBeenCalledWith({ name: "geolocation" });
  });

  it("falls back to prompt when there is no Permissions API", async () => {
    vi.stubGlobal("navigator", {});
    expect(await queryGeoPermission()).toBe("prompt");
    vi.stubGlobal("navigator", undefined);
    expect(await queryGeoPermission()).toBe("prompt");
  });

  it("falls back to prompt when the query rejects (Safari)", async () => {
    vi.stubGlobal("navigator", {
      permissions: { query: vi.fn().mockRejectedValue(new TypeError("not supported")) },
    });
    expect(await queryGeoPermission()).toBe("prompt");
  });
});
