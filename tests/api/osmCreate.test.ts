import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/osm/create/route";
import { API_BASE, OAUTH_BASE } from "@/lib/osm";
import { appendJson } from "@/lib/db";

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

function fetchSeq(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function post(body: unknown, auth = "Bearer tok-1"): Request {
  return new Request("http://test.local/api/osm/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

const today = new Date().toISOString().slice(0, 10);
const validBody = { lat: 48.86, lon: 2.36, tag: { key: "amenity", value: "drinking_water" } };

beforeEach(() => {
  h.jar.clear();
});

describe("POST /api/osm/create", () => {
  it("requires an OSM session", async () => {
    const res = await POST(post(validBody, ""));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid body", async () => {
    const res = await POST(post({ lat: 48.86, lon: 2.36 }));
    expect(res.status).toBe(400);
  });

  it("creates the node with the surveyed tag plus a fresh check_date", async () => {
    const fetchMock = fetchSeq(text("88"), text("123456"));

    const res = await POST(post(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      changesetId: 88,
      changesetUrl: `${OAUTH_BASE}/changeset/88`,
      nodeId: 123456,
      lat: 48.86,
      lon: 2.36,
      tags: { amenity: "drinking_water", check_date: today },
      summary: "added amenity=drinking_water",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/api/0.6/changeset/create`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE}/api/0.6/node/create`);
    const xml = fetchMock.mock.calls[1][1]?.body as string;
    expect(xml).toContain('lat="48.86"');
    expect(xml).toContain('lon="2.36"');
    expect(xml).toContain('changeset="88"');
    expect(xml).toContain('<tag k="amenity" v="drinking_water"/>');
    expect(xml).toContain(`<tag k="check_date" v="${today}"/>`);

    expect(vi.mocked(appendJson)).toHaveBeenCalledWith(
      "edit-log.json",
      expect.objectContaining({
        nodeId: 123456,
        action: "create",
        changesetId: 88,
        newVersion: 1,
      }),
    );
  });

  it("applies survey extras (audience, seasonal, note) to the new node's tags", async () => {
    const fetchMock = fetchSeq(text("88"), text("123456"));

    const res = await POST(
      post({
        ...validBody,
        extras: { audience: "both", seasonal: true, note: "behind the kiosk" },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).tags).toEqual({
      amenity: "drinking_water",
      check_date: today,
      dog: "yes",
      seasonal: "yes",
      note: "behind the kiosk",
    });

    const xml = fetchMock.mock.calls[1][1]?.body as string;
    expect(xml).toContain('<tag k="dog" v="yes"/>');
    expect(xml).toContain('<tag k="seasonal" v="yes"/>');
  });

  it("retags a dogs-only drinking_water create as amenity=watering_place", async () => {
    fetchSeq(text("88"), text("123456"));

    const res = await POST(post({ ...validBody, extras: { audience: "dogs" } }));
    expect(res.status).toBe(200);
    expect((await res.json()).tags).toEqual({
      amenity: "watering_place",
      check_date: today,
      drinking_water: "no",
      dog: "yes",
    });
  });

  it("reuses the run's shared changeset when provided", async () => {
    const fetchMock = fetchSeq(text("123456"));

    const res = await POST(post({ ...validBody, changesetId: 9 }));
    expect(res.status).toBe(200);
    expect((await res.json()).changesetId).toBe(9);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.body).toContain('changeset="9"');
  });

  it("reopens a fresh changeset when the provided one was already closed", async () => {
    const fetchMock = fetchSeq(
      text("The changeset 9 was closed at 2026-06-30 02:37:57 UTC.", 409),
      text("88"), // recovery: open a fresh changeset
      text("123456"),
    );

    const res = await POST(post({ ...validBody, changesetId: 9 }));
    expect(res.status).toBe(200);
    expect((await res.json()).changesetId).toBe(88);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE}/api/0.6/changeset/create`);
    expect(fetchMock.mock.calls[2][1]?.body).toContain('changeset="88"');
  });

  it("maps OSM failures to 502", async () => {
    fetchSeq(text("unauthorized", 401));
    const res = await POST(post(validBody));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("open changeset 401");
  });
});
