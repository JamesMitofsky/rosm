import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, apiUrl, isNative, setApiTokenGetter } from "@/lib/api";
import { Capacitor } from "@capacitor/core";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}));

const nativeMock = vi.mocked(Capacitor.isNativePlatform);

afterEach(() => {
  setApiTokenGetter(() => null);
  nativeMock.mockReturnValue(false);
});

describe("apiUrl", () => {
  it("passes absolute URLs through untouched", () => {
    expect(apiUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(apiUrl("http://example.com/x")).toBe("http://example.com/x");
  });

  it("keeps relative /api paths on the same origin by default", () => {
    // NEXT_PUBLIC_API_BASE is unset in tests, so the base is empty.
    expect(apiUrl("/api/run")).toBe("/api/run");
  });
});

describe("isNative", () => {
  it("reflects the Capacitor platform", () => {
    expect(isNative()).toBe(false);
    nativeMock.mockReturnValue(true);
    expect(isNative()).toBe(true);
  });
});

describe("apiFetch — web", () => {
  it("fetches with same-origin cookies included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/osm/status");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/osm/status");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });

  it("adds a Bearer header when a token getter is wired", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    setApiTokenGetter(() => "tok-1");

    await apiFetch("/api/osm/status");
    const init = fetchMock.mock.calls[0][1];
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-1");
  });

  it("never overwrites an explicit Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    setApiTokenGetter(() => "tok-1");

    await apiFetch("/api/osm/status", { headers: { Authorization: "Bearer explicit" } });
    const init = fetchMock.mock.calls[0][1];
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer explicit");
  });

  it("respects an explicit credentials override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/osm/status", { credentials: "omit" });
    expect(fetchMock.mock.calls[0][1].credentials).toBe("omit");
  });
});

describe("apiFetch — native short-circuits", () => {
  it.each(["/api/run", "/api/draft"])(
    "short-circuits %s with a null body and no network",
    async (path) => {
      nativeMock.mockReturnValue(true);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const res = await apiFetch(path, { method: "POST", body: "{}" });
      expect(res.status).toBe(200);
      expect(await res.json()).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("still sends OSM calls from native", async () => {
    nativeMock.mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/osm/edit", { method: "POST" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not short-circuit lookalike paths", async () => {
    nativeMock.mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/running-total");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
