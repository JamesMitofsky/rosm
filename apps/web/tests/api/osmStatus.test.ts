import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET } from "@/app/api/osm/status/route";
import { API_BASE } from "@/lib/osm";

const h = vi.hoisted(() => ({ jar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      h.jar.has(name) ? { name, value: h.jar.get(name) as string } : undefined,
  }),
}));

function get(auth?: string): Request {
  return new Request("http://test.local/api/osm/status", {
    headers: auth ? { Authorization: auth } : {},
  });
}

beforeEach(() => {
  h.jar.clear();
});

describe("GET /api/osm/status", () => {
  it("reports the targeted API base and whether it is the live OSM", async () => {
    const res = await GET(get());
    const json = await res.json();
    expect(json.apiBase).toBe(API_BASE);
    expect(json.live).toBe(API_BASE.includes("api.openstreetmap.org"));
  });

  it("skips the login gate outside production (dev/test convenience)", async () => {
    const res = await GET(get());
    expect((await res.json()).loggedIn).toBe(true);
  });

  it("requires a real token in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await (await GET(get())).json()).loggedIn).toBe(false);
    expect((await (await GET(get("Bearer tok"))).json()).loggedIn).toBe(true);
  });

  it("accepts the cookie session in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    h.jar.set("osm_token", "cookie-tok");
    expect((await (await GET(get())).json()).loggedIn).toBe(true);
  });

  it("ignores a malformed Authorization scheme", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await (await GET(get("Basic dXNlcg=="))).json()).loggedIn).toBe(false);
    expect((await (await GET(get("Bearer "))).json()).loggedIn).toBe(false);
  });
});

describe("DELETE /api/osm/status (logout)", () => {
  it("expires the osm_token cookie", async () => {
    const res = await DELETE();
    expect(await res.json()).toEqual({ ok: true });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("osm_token=;");
  });
});
