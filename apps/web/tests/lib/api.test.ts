import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("fetches with same-origin cookies included by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/osm/status");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/osm/status");
    expect(init.credentials).toBe("include");
  });

  it("respects an explicit credentials override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/osm/status", { credentials: "omit" });
    expect(fetchMock.mock.calls[0][1].credentials).toBe("omit");
  });

  it("forwards the path, method and body untouched", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/osm/edit", { method: "POST", body: "{}" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/osm/edit");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
  });
});
