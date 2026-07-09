import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getRun, POST as postRun } from "@/app/api/run/route";
import { DELETE as deleteDraft, GET as getDraft, POST as postDraft } from "@/app/api/draft/route";

// In-memory stand-in for the JSON pseudo-DB.
const h = vi.hoisted(() => ({ files: new Map<string, unknown>() }));

vi.mock("@/lib/db", () => ({
  readJson: vi.fn(async (name: string, fallback: unknown) =>
    h.files.has(name) ? h.files.get(name) : fallback,
  ),
  writeJson: vi.fn(async (name: string, data: unknown) => {
    h.files.set(name, data);
  }),
  appendJson: vi.fn(async (name: string, item: unknown) => {
    const arr = (h.files.get(name) as unknown[] | undefined) ?? [];
    arr.push(item);
    h.files.set(name, arr);
  }),
}));

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.files.clear();
});

describe("/api/run", () => {
  it("returns null before any run is saved", async () => {
    const res = await getRun();
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("persists the active run plan and reads it back", async () => {
    const plan = { stops: [{ id: 1 }], index: 2, routeId: "r1" };
    const postRes = await postRun(post("http://test.local/api/run", plan));
    expect(await postRes.json()).toEqual({ ok: true });
    expect(h.files.get("current-run.json")).toEqual(plan);

    const res = await getRun();
    expect(await res.json()).toEqual(plan);
  });

  it("overwrites the previous run on re-save", async () => {
    await postRun(post("http://test.local/api/run", { index: 0 }));
    await postRun(post("http://test.local/api/run", { index: 5 }));
    expect(await (await getRun()).json()).toEqual({ index: 5 });
  });
});

describe("/api/draft", () => {
  it("returns null before any draft is saved", async () => {
    expect(await (await getDraft()).json()).toBeNull();
  });

  it("persists an in-progress planner draft", async () => {
    const draft = { targetMiles: 5, pinned: [7] };
    await postDraft(post("http://test.local/api/draft", draft));
    expect(await (await getDraft()).json()).toEqual(draft);
    expect(h.files.get("current-draft.json")).toEqual(draft);
  });

  it("clears the draft on DELETE", async () => {
    await postDraft(post("http://test.local/api/draft", { targetMiles: 5 }));
    const res = await deleteDraft();
    expect(await res.json()).toEqual({ ok: true });
    expect(await (await getDraft()).json()).toBeNull();
  });
});
