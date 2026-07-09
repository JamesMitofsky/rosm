import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/osm/edit/route";
import { API_BASE, OAUTH_BASE } from "@/lib/osm";
import { editSummary } from "@/lib/editSummary";
import { appendJson } from "@/lib/db";

// Cookie jar backing the next/headers mock (web auth path).
const h = vi.hoisted(() => ({ jar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      h.jar.has(name) ? { name, value: h.jar.get(name) as string } : undefined,
  }),
}));

vi.mock("@/lib/db", () => ({
  appendJson: vi.fn(async () => {}),
  readJson: vi.fn(),
  writeJson: vi.fn(),
}));

const text = (body: string, status = 200) => new Response(body, { status });
const nodeJson = (version: number, tags: Record<string, string>) =>
  new Response(JSON.stringify({ elements: [{ lat: 1.5, lon: 2.5, version, tags }] }), {
    status: 200,
  });

function fetchSeq(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function post(body: unknown, auth = "Bearer tok-1"): Request {
  return new Request("http://test.local/api/osm/edit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

const today = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  h.jar.clear();
});

describe("POST /api/osm/edit", () => {
  it("requires an OSM session", async () => {
    const res = await POST(post({ nodeId: 5, action: "confirm" }, ""));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "not signed in to OSM" });
  });

  it("accepts the token from the httpOnly cookie (web)", async () => {
    h.jar.set("osm_token", "cookie-tok");
    const fetchMock = fetchSeq(nodeJson(3, { amenity: "drinking_water" }), text("4"));

    const res = await POST(post({ nodeId: 5, action: "confirm", changesetId: 9 }, ""));
    expect(res.status).toBe(200);
    for (const call of fetchMock.mock.calls) {
      expect(call[1]?.headers?.Authorization).toBe("Bearer cookie-tok");
    }
  });

  it("rejects an invalid body", async () => {
    const res = await POST(post({ nodeId: "five", action: "confirm" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });

  it("opens a changeset, applies the lifecycle transform and reports the edit", async () => {
    const fetchMock = fetchSeq(
      text(" 77\n"), // open changeset
      nodeJson(3, { amenity: "drinking_water", name: "Old Fountain" }),
      text("4"), // put node -> new version
    );

    const res = await POST(post({ nodeId: 5, action: "out_of_order" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      changesetId: 77,
      changesetUrl: `${OAUTH_BASE}/changeset/77`,
      nodeId: 5,
      action: "out_of_order",
      newVersion: 4,
      summary: editSummary("out_of_order", "amenity", today),
    });

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/api/0.6/changeset/create`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE}/api/0.6/node/5.json`);
    expect(fetchMock.mock.calls[2][0]).toBe(`${API_BASE}/api/0.6/node/5`);

    const putXml = fetchMock.mock.calls[2][1]?.body as string;
    expect(putXml).toContain('version="3"');
    expect(putXml).toContain('changeset="77"');
    expect(putXml).toContain('<tag k="disused:amenity" v="drinking_water"/>');
    expect(putXml).toContain(`<tag k="check_date" v="${today}"/>`);
    expect(putXml).toContain('<tag k="name" v="Old Fountain"/>');
    expect(putXml).not.toContain('<tag k="amenity"');

    expect(vi.mocked(appendJson)).toHaveBeenCalledWith(
      "edit-log.json",
      expect.objectContaining({
        nodeId: 5,
        action: "out_of_order",
        changesetId: 77,
        newVersion: 4,
      }),
    );
  });

  it("reuses a provided changeset instead of opening a new one", async () => {
    const fetchMock = fetchSeq(nodeJson(3, { amenity: "drinking_water" }), text("4"));

    const res = await POST(post({ nodeId: 5, action: "confirm", changesetId: 9 }));
    expect(res.status).toBe(200);
    expect((await res.json()).changesetId).toBe(9);
    // No changeset/create call: straight to node read + write.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.body).toContain('changeset="9"');
  });

  it("writes advanced extras as real tags and mirrors them in the summary", async () => {
    const fetchMock = fetchSeq(nodeJson(3, { amenity: "drinking_water" }), text("4"));

    const res = await POST(
      post({
        nodeId: 5,
        action: "confirm",
        changesetId: 9,
        extras: { seasonal: true, note: "runs in summer" },
      }),
    );
    const putXml = fetchMock.mock.calls[1][1]?.body as string;
    expect(putXml).toContain('<tag k="seasonal" v="yes"/>');
    expect(putXml).toContain('<tag k="note" v="runs in summer"/>');
    expect((await res.json()).summary).toContain("seasonal=yes");
  });

  it("re-reads the node and retries on a 409 version conflict", async () => {
    const fetchMock = fetchSeq(
      text("77"),
      nodeJson(3, { amenity: "drinking_water" }),
      text("conflict", 409), // concurrent editor bumped the version
      nodeJson(4, { amenity: "drinking_water" }),
      text("5"),
    );

    const res = await POST(post({ nodeId: 5, action: "confirm" }));
    expect(res.status).toBe(200);
    expect((await res.json()).newVersion).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    // The retry writes against the freshly-read version.
    expect(fetchMock.mock.calls[4][1]?.body).toContain('version="4"');
  });

  it("gives up after three conflicted attempts", async () => {
    const fetchMock = fetchSeq(
      text("77"),
      nodeJson(3, {}),
      text("conflict", 409),
      nodeJson(4, {}),
      text("conflict", 409),
      nodeJson(5, {}),
      text("conflict", 409),
    );

    const res = await POST(post({ nodeId: 5, action: "confirm" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("put node 409");
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(vi.mocked(appendJson)).not.toHaveBeenCalled();
  });

  it("reopens a fresh changeset when the provided one was already closed", async () => {
    const fetchMock = fetchSeq(
      nodeJson(3, { amenity: "drinking_water" }),
      text("The changeset 9 was closed at 2026-06-30 02:37:57 UTC.", 409),
      text("88"), // recovery: open a fresh changeset
      nodeJson(3, { amenity: "drinking_water" }),
      text("4"),
    );

    const res = await POST(post({ nodeId: 5, action: "confirm", changesetId: 9 }));
    expect(res.status).toBe(200);
    expect((await res.json()).changesetId).toBe(88);
    expect(fetchMock.mock.calls[2][0]).toBe(`${API_BASE}/api/0.6/changeset/create`);
    // The retried write goes into the fresh changeset.
    expect(fetchMock.mock.calls[4][1]?.body).toContain('changeset="88"');
  });

  it("reopens at most once, then fails like any exhausted 409", async () => {
    fetchSeq(
      nodeJson(3, {}),
      text("The changeset 9 was closed at 2026-06-30 02:37:57 UTC.", 409),
      text("88"),
      nodeJson(3, {}),
      text("The changeset 88 was closed at 2026-06-30 03:00:00 UTC.", 409),
      nodeJson(3, {}),
      text("The changeset 88 was closed at 2026-06-30 03:00:00 UTC.", 409),
      nodeJson(3, {}),
      text("The changeset 88 was closed at 2026-06-30 03:00:00 UTC.", 409),
    );

    const res = await POST(post({ nodeId: 5, action: "confirm", changesetId: 9 }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("was closed");
  });

  it("surfaces a deleted node as an error", async () => {
    fetchSeq(text("77"), new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    const res = await POST(post({ nodeId: 5, action: "confirm" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("not found");
  });
});
