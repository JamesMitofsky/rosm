import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/osm/revert/route";
import { API_BASE, OAUTH_BASE } from "@/lib/osm";
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
const emptyNode = () => new Response(JSON.stringify({ elements: [] }), { status: 200 });

function fetchSeq(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function post(body: unknown, auth = "Bearer tok-1"): Request {
  return new Request("http://test.local/api/osm/revert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.jar.clear();
  vi.mocked(appendJson).mockClear();
});

describe("POST /api/osm/revert", () => {
  it("requires an OSM session", async () => {
    const res = await POST(post({ nodeId: 5, kind: "edit", sentVersion: 4 }, ""));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid body", async () => {
    const res = await POST(post({ nodeId: 5, kind: "unmake", sentVersion: 4 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });

  it("restores the previous version's tags for an edit revert", async () => {
    const fetchMock = fetchSeq(
      nodeJson(4, { amenity: "drinking_water", check_date: "2026-07-11" }), // current (our edit)
      nodeJson(3, { amenity: "drinking_water" }), // version before ours
      text("5"), // put -> new version
    );

    const res = await POST(post({ nodeId: 5, kind: "edit", sentVersion: 4, changesetId: 9 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      changesetId: 9,
      changesetUrl: `${OAUTH_BASE}/changeset/9`,
      nodeId: 5,
      newVersion: 5,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/api/0.6/node/5.json`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE}/api/0.6/node/5/3.json`);
    expect(fetchMock.mock.calls[2][0]).toBe(`${API_BASE}/api/0.6/node/5`);

    const putXml = fetchMock.mock.calls[2][1]?.body as string;
    // Written against the CURRENT version, with the PREVIOUS version's tags.
    expect(putXml).toContain('version="4"');
    expect(putXml).toContain('changeset="9"');
    expect(putXml).toContain('<tag k="amenity" v="drinking_water"/>');
    expect(putXml).not.toContain("check_date");

    expect(vi.mocked(appendJson)).toHaveBeenCalledWith(
      "edit-log.json",
      expect.objectContaining({ nodeId: 5, action: "revert", changesetId: 9, newVersion: 5 }),
    );
  });

  it("aborts with 409 when someone else edited since — no write attempted", async () => {
    const fetchMock = fetchSeq(nodeJson(6, { amenity: "drinking_water" })); // v6 ≠ our v4

    const res = await POST(post({ nodeId: 5, kind: "edit", sentVersion: 4, changesetId: 9 }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("changed by someone else");
    expect(fetchMock).toHaveBeenCalledTimes(1); // read only, nothing written
    expect(vi.mocked(appendJson)).not.toHaveBeenCalled();
  });

  it("opens a changeset when none is provided", async () => {
    const fetchMock = fetchSeq(
      nodeJson(4, {}),
      text(" 77\n"), // open changeset
      nodeJson(3, {}),
      text("5"),
    );

    const res = await POST(post({ nodeId: 5, kind: "edit", sentVersion: 4 }));
    expect(res.status).toBe(200);
    expect((await res.json()).changesetId).toBe(77);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE}/api/0.6/changeset/create`);
  });

  it("reopens a fresh changeset once when the provided one was closed", async () => {
    const fetchMock = fetchSeq(
      nodeJson(4, {}),
      nodeJson(3, {}),
      text("The changeset 9 was closed at 2026-06-30 02:37:57 UTC.", 409),
      text("88"), // recovery: fresh changeset
      nodeJson(3, {}),
      text("5"),
    );

    const res = await POST(post({ nodeId: 5, kind: "edit", sentVersion: 4, changesetId: 9 }));
    expect(res.status).toBe(200);
    expect((await res.json()).changesetId).toBe(88);
    expect(fetchMock.mock.calls[5][1]?.body).toContain('changeset="88"');
  });

  it("deletes the node for a create revert", async () => {
    const fetchMock = fetchSeq(
      nodeJson(1, { amenity: "drinking_water", check_date: "2026-07-11" }),
      text("2"), // delete -> new version
    );

    const res = await POST(post({ nodeId: 42, kind: "create", sentVersion: 1, changesetId: 9 }));
    expect(res.status).toBe(200);
    expect((await res.json()).newVersion).toBe(2);

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API_BASE}/api/0.6/node/42`);
    expect(init?.method).toBe("DELETE");
    expect(init?.body).toContain('version="1"');
    expect(init?.body).toContain('changeset="9"');
  });

  it("treats an already-deleted node as a successful create undo", async () => {
    const fetchMock = fetchSeq(emptyNode()); // getNode -> 410 not found

    const res = await POST(post({ nodeId: 42, kind: "create", sentVersion: 1, changesetId: 9 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nodeId: 42, alreadyGone: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(appendJson)).not.toHaveBeenCalled();
  });

  it("aborts a create revert when someone else has touched the new node", async () => {
    fetchSeq(nodeJson(2, {})); // v2: edited since we created it

    const res = await POST(post({ nodeId: 42, kind: "create", sentVersion: 1, changesetId: 9 }));
    expect(res.status).toBe(409);
  });

  it("surfaces OSM failures as 502", async () => {
    fetchSeq(text("boom", 500));
    const res = await POST(post({ nodeId: 5, kind: "edit", sentVersion: 4, changesetId: 9 }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("get node 500");
  });
});
