import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/osm/close/route";
import { API_BASE, OAUTH_BASE } from "@/lib/osm";

const h = vi.hoisted(() => ({ jar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      h.jar.has(name) ? { name, value: h.jar.get(name) as string } : undefined,
  }),
}));

function post(body: unknown, auth = "Bearer tok-1"): Request {
  return new Request("http://test.local/api/osm/close", {
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
});

describe("POST /api/osm/close", () => {
  it("requires an OSM session", async () => {
    const res = await POST(post({ changesetId: 42 }, ""));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "not signed in" });
  });

  it("succeeds as a no-op when no changeset was opened", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(post({}));
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes the changeset and links to it", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(post({ changesetId: 42 }));
    expect(await res.json()).toEqual({
      ok: true,
      changesetUrl: `${OAUTH_BASE}/changeset/42`,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/api/0.6/changeset/42/close`);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PUT");
  });

  it("reports a close failure while reassuring that edits are already saved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("conflict", { status: 409 })),
    );

    const res = await POST(post({ changesetId: 42 }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain("close changeset 409");
    expect(json.error).toContain("edits already saved");
  });
});
