import crypto from "crypto";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  API_BASE,
  OAUTH_BASE,
  OsmApiError,
  applyAction,
  authUrl,
  changesetUrl,
  closeChangeset,
  createNode,
  exchangeToken,
  getNode,
  isChangesetClosed,
  makePkce,
  openChangeset,
  putNode,
  todayIso,
} from "@/lib/osm";
import { APP_NAME } from "@/lib/appConfig";

const T = "2026-01-02";

function mockFetch(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const text = (body: string, status = 200) => new Response(body, { status });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("applyAction", () => {
  const base = { amenity: "drinking_water", name: "Old Fountain" };

  it("confirm stamps check_date and keeps everything else", () => {
    const next = applyAction(base, "confirm", "amenity", T);
    expect(next).toEqual({ ...base, check_date: T });
  });

  it("does not mutate the input tags", () => {
    const tags = { amenity: "drinking_water" };
    applyAction(tags, "removed", "amenity", T);
    expect(tags).toEqual({ amenity: "drinking_water" });
  });

  it("out_of_order moves the primary tag behind disused:", () => {
    const next = applyAction(base, "out_of_order", "amenity", T);
    expect(next["disused:amenity"]).toBe("drinking_water");
    expect(next.amenity).toBeUndefined();
    expect(next.check_date).toBe(T);
    expect(next.name).toBe("Old Fountain");
  });

  it("removed moves the primary tag behind abandoned:", () => {
    const next = applyAction(base, "removed", "amenity", T);
    expect(next["abandoned:amenity"]).toBe("drinking_water");
    expect(next.amenity).toBeUndefined();
    expect(next.check_date).toBe(T);
  });

  it("lifecycle actions respect a non-default primary key", () => {
    const next = applyAction({ natural: "spring" }, "out_of_order", "natural", T);
    expect(next["disused:natural"]).toBe("spring");
    expect(next.natural).toBeUndefined();
  });

  it("lifecycle actions still stamp check_date when the primary key is absent", () => {
    const next = applyAction({ name: "x" }, "removed", "amenity", T);
    expect(next).toEqual({ name: "x", check_date: T });
    expect(Object.keys(next).some((k) => k.startsWith("abandoned:"))).toBe(false);
  });

  describe("dog_only", () => {
    it("demotes amenity=drinking_water to man_made=water_tap with explicit flags", () => {
      const next = applyAction({ amenity: "drinking_water" }, "dog_only", "amenity", T);
      expect(next).toEqual({
        man_made: "water_tap",
        drinking_water: "no",
        dog: "yes",
        check_date: T,
      });
    });

    it("demotes amenity=water_point the same way", () => {
      const next = applyAction({ amenity: "water_point" }, "dog_only", "amenity", T);
      expect(next.man_made).toBe("water_tap");
      expect(next.amenity).toBeUndefined();
    });

    it("keeps non-potability-asserting primaries (amenity=fountain)", () => {
      const next = applyAction({ amenity: "fountain" }, "dog_only", "amenity", T);
      expect(next.amenity).toBe("fountain");
      expect(next.man_made).toBeUndefined();
      expect(next.drinking_water).toBe("no");
      expect(next.dog).toBe("yes");
    });
  });

  describe("extras", () => {
    it("writes note for any action", () => {
      expect(applyAction(base, "removed", "amenity", T, { note: "gone" }).note).toBe("gone");
      expect(applyAction(base, "confirm", "amenity", T, { note: "ok" }).note).toBe("ok");
    });

    it("writes seasonal=yes only where the source still exists", () => {
      expect(applyAction(base, "confirm", "amenity", T, { seasonal: true }).seasonal).toBe("yes");
      expect(applyAction(base, "dog_only", "amenity", T, { seasonal: true }).seasonal).toBe("yes");
      expect(
        applyAction(base, "out_of_order", "amenity", T, { seasonal: true }).seasonal,
      ).toBeUndefined();
      expect(
        applyAction(base, "removed", "amenity", T, { seasonal: true }).seasonal,
      ).toBeUndefined();
    });

    it("ignores seasonal: false", () => {
      const next = applyAction(base, "confirm", "amenity", T, { seasonal: false });
      expect(next.seasonal).toBeUndefined();
    });
  });
});

describe("PKCE", () => {
  it("makePkce returns a base64url verifier and its S256 challenge", () => {
    const { verifier, challenge } = makePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const expected = crypto.createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });

  it("generates a fresh verifier per call", () => {
    expect(makePkce().verifier).not.toBe(makePkce().verifier);
  });

  it("authUrl points at the OAuth authorize endpoint with all PKCE params", () => {
    const url = new URL(authUrl("https://app.test/api/osm/callback", "chal123", "state456"));
    expect(url.origin + url.pathname).toBe(`${OAUTH_BASE}/oauth2/authorize`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/api/osm/callback");
    expect(url.searchParams.get("code_challenge")).toBe("chal123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state456");
    expect(url.searchParams.get("scope")).toBe("read_prefs write_api");
  });
});

describe("exchangeToken", () => {
  it("POSTs the code + verifier and returns the access token", async () => {
    const fetchMock = mockFetch(json({ access_token: "tok-1" }));
    const token = await exchangeToken("code-1", "verifier-1", "https://app.test/cb");
    expect(token).toBe("tok-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${OAUTH_BASE}/oauth2/token`);
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-1");
    expect(body.get("code_verifier")).toBe("verifier-1");
    expect(body.get("redirect_uri")).toBe("https://app.test/cb");
  });

  it("throws with status + body on failure", async () => {
    mockFetch(text("bad grant", 400));
    await expect(exchangeToken("c", "v", "https://app.test/cb")).rejects.toThrow(
      "token exchange 400: bad grant",
    );
  });
});

describe("changesets", () => {
  let fetchMock: Mock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("openChangeset PUTs XML and returns the numeric id", async () => {
    fetchMock.mockResolvedValueOnce(text(" 42\n"));
    const id = await openChangeset("tok", "Survey run");
    expect(id).toBe(42);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/api/0.6/changeset/create`);
    expect(init.method).toBe("PUT");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers["Content-Type"]).toBe("text/xml");
    expect(init.body).toContain(`<tag k="created_by" v="${APP_NAME}"/>`);
    expect(init.body).toContain('<tag k="comment" v="Survey run"/>');
  });

  it("openChangeset escapes XML special characters in the comment", async () => {
    fetchMock.mockResolvedValueOnce(text("1"));
    await openChangeset("tok", `a & b < c > "d" \x07bell`);
    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).toContain('v="a &amp; b &lt; c &gt; &quot;d&quot; bell"');
  });

  it("openChangeset throws OsmApiError with the HTTP status", async () => {
    fetchMock.mockResolvedValueOnce(text("nope", 401));
    const err = await openChangeset("tok", "c").catch((e) => e);
    expect(err).toBeInstanceOf(OsmApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("open changeset 401: nope");
  });

  it("closeChangeset PUTs to the close endpoint", async () => {
    fetchMock.mockResolvedValueOnce(text(""));
    await closeChangeset("tok", 42);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/api/0.6/changeset/42/close`);
    expect(init.method).toBe("PUT");
  });

  it("closeChangeset surfaces failures", async () => {
    fetchMock.mockResolvedValueOnce(text("conflict", 409));
    await expect(closeChangeset("tok", 42)).rejects.toMatchObject({
      name: "OsmApiError",
      status: 409,
    });
  });

  describe("isChangesetClosed", () => {
    it("matches a 409 whose body says the changeset was closed", () => {
      const e = new OsmApiError(
        409,
        "put node",
        "The changeset 184824990 was closed at 2026-06-30 02:37:57 UTC.",
      );
      expect(isChangesetClosed(e)).toBe(true);
    });

    it("rejects a 409 version conflict on the node itself", () => {
      const e = new OsmApiError(409, "put node", "Version mismatch: Provided 3, server had: 4");
      expect(isChangesetClosed(e)).toBe(false);
    });

    it("rejects other statuses and plain errors", () => {
      expect(isChangesetClosed(new OsmApiError(404, "put node", "was closed"))).toBe(false);
      expect(isChangesetClosed(new Error("The changeset 9 was closed"))).toBe(false);
    });
  });

  it("changesetUrl links to the web (not API) host", () => {
    expect(changesetUrl(7)).toBe(`${OAUTH_BASE}/changeset/7`);
  });
});

describe("nodes", () => {
  let fetchMock: Mock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("getNode returns version, coords and tags", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        elements: [{ lat: 48.1, lon: 2.2, version: 3, tags: { amenity: "drinking_water" } }],
      }),
    );
    const node = await getNode("tok", 99);
    expect(node).toEqual({
      version: 3,
      lat: 48.1,
      lon: 2.2,
      tags: { amenity: "drinking_water" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/api/0.6/node/99.json`);
  });

  it("getNode defaults missing tags to {}", async () => {
    fetchMock.mockResolvedValueOnce(json({ elements: [{ lat: 1, lon: 2, version: 1 }] }));
    expect((await getNode("tok", 1)).tags).toEqual({});
  });

  it("getNode reports deleted/redacted nodes as a 410 OsmApiError", async () => {
    fetchMock.mockResolvedValueOnce(json({ elements: [] }));
    await expect(getNode("tok", 5)).rejects.toMatchObject({
      name: "OsmApiError",
      status: 410,
    });
  });

  it("putNode PUTs the node XML and returns the new version", async () => {
    fetchMock.mockResolvedValueOnce(text("4"));
    const v = await putNode(
      "tok",
      1,
      { version: 3, lat: 48.1, lon: 2.2, tags: { amenity: "drinking_water", note: "a<b" } },
      42,
    );
    expect(v).toBe(4);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/api/0.6/node/1`);
    expect(init.body).toBe(
      '<osm><node id="1" version="3" lat="48.1" lon="2.2" changeset="42">' +
        '<tag k="amenity" v="drinking_water"/><tag k="note" v="a&lt;b"/></node></osm>',
    );
  });

  it("putNode throws OsmApiError on conflict", async () => {
    fetchMock.mockResolvedValueOnce(text("version mismatch", 409));
    await expect(
      putNode("tok", 1, { version: 1, lat: 0, lon: 0, tags: {} }, 42),
    ).rejects.toMatchObject({ status: 409, op: "put node" });
  });

  it("createNode PUTs to node/create and returns the new id", async () => {
    fetchMock.mockResolvedValueOnce(text("123456"));
    const id = await createNode("tok", 48.1, 2.2, { amenity: "drinking_water" }, 42);
    expect(id).toBe(123456);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/api/0.6/node/create`);
    expect(init.body).toBe(
      '<osm><node lat="48.1" lon="2.2" changeset="42">' +
        '<tag k="amenity" v="drinking_water"/></node></osm>',
    );
  });
});

describe("todayIso", () => {
  it("returns today as YYYY-MM-DD", () => {
    expect(todayIso()).toBe(new Date().toISOString().slice(0, 10));
  });
});
