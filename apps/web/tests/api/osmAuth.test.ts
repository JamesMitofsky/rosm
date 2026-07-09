import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/osm/auth/route";
import { OAUTH_BASE } from "@/lib/osm";

function get(query = ""): Request {
  return new Request(`http://localhost:3000/api/osm/auth${query}`);
}

describe("GET /api/osm/auth", () => {
  it("redirects to the OSM authorize endpoint with a full PKCE handshake", async () => {
    const res = await GET(get());
    expect(res.status).toBe(307);

    const loc = new URL(res.headers.get("location") as string);
    expect(loc.origin + loc.pathname).toBe(`${OAUTH_BASE}/oauth2/authorize`);
    expect(loc.searchParams.get("response_type")).toBe("code");
    expect(loc.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/osm/callback");
    expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
    expect(loc.searchParams.get("scope")).toBe("read_prefs write_api");

    // The verifier cookie must hash to the challenge sent upstream.
    const verifier = res.cookies.get("osm_pkce")?.value as string;
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const expectedChallenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    expect(loc.searchParams.get("code_challenge")).toBe(expectedChallenge);

    // The state cookie must match the state param (CSRF check on callback).
    expect(loc.searchParams.get("state")).toBe(res.cookies.get("osm_state")?.value);
    expect(loc.searchParams.get("state")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("stores the PKCE transients as short-lived httpOnly cookies", async () => {
    const res = await GET(get());
    for (const name of ["osm_pkce", "osm_state"]) {
      const cookie = res.cookies.get(name);
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.maxAge).toBe(600);
      expect(cookie?.path).toBe("/");
    }
  });

  it("stays a web sign-in by default", async () => {
    const res = await GET(get());
    expect(res.cookies.get("osm_native")).toBeUndefined();
  });

  it("marks a native (Capacitor) sign-in with the osm_native cookie", async () => {
    const res = await GET(get("?native=1"));
    expect(res.cookies.get("osm_native")?.value).toBe("1");
    expect(res.cookies.get("osm_native")?.httpOnly).toBe(true);
  });

  it("issues a fresh verifier and state per attempt", async () => {
    const a = await GET(get());
    const b = await GET(get());
    expect(a.cookies.get("osm_pkce")?.value).not.toBe(b.cookies.get("osm_pkce")?.value);
    expect(a.cookies.get("osm_state")?.value).not.toBe(b.cookies.get("osm_state")?.value);
  });
});
