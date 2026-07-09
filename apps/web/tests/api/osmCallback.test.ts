import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/osm/callback/route";
import { OAUTH_BASE } from "@/lib/osm";

const h = vi.hoisted(() => ({ jar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      h.jar.has(name) ? { name, value: h.jar.get(name) as string } : undefined,
  }),
}));

const tokenOk = () =>
  new Response(JSON.stringify({ access_token: "tok-9" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function get(query: string): Request {
  return new Request(`http://localhost:3000/api/osm/callback${query}`);
}

function armWebSession() {
  h.jar.set("osm_pkce", "verifier-1");
  h.jar.set("osm_state", "state-1");
}

beforeEach(() => {
  h.jar.clear();
});

describe("GET /api/osm/callback — web", () => {
  it("exchanges the code and stores the token in an httpOnly cookie", async () => {
    armWebSession();
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenOk());
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(get("?code=code-1&state=state-1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/?osm=ok");

    const token = res.cookies.get("osm_token");
    expect(token?.value).toBe("tok-9");
    expect(token?.httpOnly).toBe(true);
    expect(token?.maxAge).toBe(60 * 60 * 24 * 7);

    // Token endpoint got the PKCE verifier and this exact redirect URI.
    expect(fetchMock.mock.calls[0][0]).toBe(`${OAUTH_BASE}/oauth2/token`);
    const body = new URLSearchParams(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.get("code")).toBe("code-1");
    expect(body.get("code_verifier")).toBe("verifier-1");
    expect(body.get("redirect_uri")).toBe("http://localhost:3000/api/osm/callback");
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("clears the transient PKCE cookies afterwards", async () => {
    armWebSession();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenOk()));

    const res = await GET(get("?code=code-1&state=state-1"));
    expect(res.cookies.get("osm_pkce")?.value).toBe("");
    expect(res.cookies.get("osm_state")?.value).toBe("");
    expect(res.cookies.get("osm_native")?.value).toBe("");
  });

  it("rejects a state mismatch without touching the token endpoint", async () => {
    armWebSession();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(get("?code=code-1&state=evil"));
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/?osm=error&msg=invalid%20oauth%20state",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.cookies.get("osm_token")).toBeUndefined();
  });

  it("rejects a callback with no stored verifier (expired/cold session)", async () => {
    const res = await GET(get("?code=code-1&state=state-1"));
    expect(res.headers.get("location")).toContain("/?osm=error");
  });

  it("rejects a callback missing the code", async () => {
    armWebSession();
    const res = await GET(get("?state=state-1"));
    expect(res.headers.get("location")).toContain("/?osm=error");
  });

  it("surfaces a failed token exchange in the error redirect", async () => {
    armWebSession();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("bad grant", { status: 400 })),
    );

    const res = await GET(get("?code=code-1&state=state-1"));
    const loc = res.headers.get("location") as string;
    expect(loc).toContain("/?osm=error");
    expect(decodeURIComponent(loc)).toContain("token exchange 400");
  });
});

describe("GET /api/osm/callback — native deep link", () => {
  it("hands the token back through the rosm:// scheme instead of a cookie", async () => {
    armWebSession();
    h.jar.set("osm_native", "1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenOk()));

    const res = await GET(get("?code=code-1&state=state-1"));
    expect(res.headers.get("location")).toBe("rosm://osm-callback?token=tok-9");
    expect(res.cookies.get("osm_token")).toBeUndefined();
  });

  it("routes failures back through the deep link too", async () => {
    armWebSession();
    h.jar.set("osm_native", "1");

    const res = await GET(get("?code=code-1&state=evil"));
    expect(res.headers.get("location")).toBe("rosm://osm-callback?error=invalid%20oauth%20state");
  });
});
