import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUndo } from "@/store/undo";
import { useOutbox, UNDO_WINDOW_MS } from "@/store/outbox";
import { apiFetch } from "@/lib/api";
import { idbDelete } from "@/lib/idb";

vi.mock("@/lib/idb", () => ({
  idbGetAll: vi.fn(async () => []),
  idbPut: vi.fn(async () => {}),
  idbDelete: vi.fn(async () => {}),
  idbClearOutbox: vi.fn(async () => {}),
  idbGetMeta: vi.fn(async () => undefined),
  idbSetMeta: vi.fn(async () => {}),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const fail = (body: unknown, status = 500) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  useOutbox.setState({ items: [], changesetId: undefined, hydrated: false });
  useUndo.setState({ target: null, busy: false, error: null });
  apiFetchMock.mockReset();
});

describe("arm", () => {
  it("offers the latest submission only, replacing any previous target", () => {
    useUndo.getState().arm({ kind: "edit", itemId: "a", nodeId: 1, summary: "first" });
    useUndo.getState().arm({ kind: "edit", itemId: "b", nodeId: 2, summary: "second" });

    const t = useUndo.getState().target;
    expect(t?.itemId).toBe("b");
    expect(t?.summary).toBe("second");
    expect(t?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("clears the toast and flushes the held edit once the window lapses", async () => {
    vi.useFakeTimers();
    try {
      apiFetchMock.mockImplementation(async () =>
        ok({ changesetId: 5, newVersion: 2, changesetUrl: "u" }),
      );
      const item = useOutbox
        .getState()
        .enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
      useUndo.getState().arm({ kind: "edit", itemId: item.id, nodeId: 1, summary: item.summary });

      await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100);

      expect(useUndo.getState().target).toBeNull();
      expect(useOutbox.getState().items[0].syncState).toBe("sent");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("perform — edit", () => {
  it("cancels a still-pending edit locally, without touching OSM", async () => {
    const onUndone = vi.fn();
    const item = useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    useUndo
      .getState()
      .arm({ kind: "edit", itemId: item.id, nodeId: 1, summary: item.summary, onUndone });

    await useUndo.getState().perform();

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(useOutbox.getState().items).toEqual([]);
    expect(vi.mocked(idbDelete)).toHaveBeenCalledWith(item.id);
    expect(onUndone).toHaveBeenCalledOnce();
    expect(useUndo.getState().target).toBeNull();
  });

  it("reverts a sent edit through /api/osm/revert and drops the item", async () => {
    apiFetchMock.mockResolvedValueOnce(ok({ changesetId: 9, newVersion: 5, nodeId: 1 }));
    const onUndone = vi.fn();
    const item = useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    useOutbox.setState((s) => ({
      changesetId: 7,
      items: s.items.map((i) => ({ ...i, syncState: "sent" as const, newVersion: 4 })),
    }));
    useUndo
      .getState()
      .arm({ kind: "edit", itemId: item.id, nodeId: 1, summary: item.summary, onUndone });

    await useUndo.getState().perform();

    expect(apiFetchMock).toHaveBeenCalledOnce();
    const [url, init] = apiFetchMock.mock.calls[0];
    expect(url).toBe("/api/osm/revert");
    expect(JSON.parse(init?.body as string)).toEqual({
      nodeId: 1,
      kind: "edit",
      sentVersion: 4,
      changesetId: 7,
    });
    expect(useOutbox.getState().items).toEqual([]);
    expect(useOutbox.getState().changesetId).toBe(9); // revert changeset adopted
    expect(onUndone).toHaveBeenCalledOnce();
    expect(useUndo.getState().target).toBeNull();
  });

  it("waits for an in-flight send to settle, then reverts", async () => {
    apiFetchMock.mockResolvedValueOnce(ok({ changesetId: 9, newVersion: 5, nodeId: 1 }));
    const item = useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    useOutbox.setState((s) => ({
      items: s.items.map((i) => ({ ...i, syncState: "sending" as const })),
    }));
    useUndo.getState().arm({ kind: "edit", itemId: item.id, nodeId: 1, summary: item.summary });

    const undo = useUndo.getState().perform();
    // Undo must not have decided anything while the POST is in flight.
    expect(apiFetchMock).not.toHaveBeenCalled();

    // The send settles as sent → undo proceeds to the revert.
    useOutbox.setState((s) => ({
      items: s.items.map((i) => ({ ...i, syncState: "sent" as const, newVersion: 4 })),
    }));
    await undo;

    expect(apiFetchMock).toHaveBeenCalledOnce();
    expect(useOutbox.getState().items).toEqual([]);
  });

  it("drops a failed send locally — it never reached OSM", async () => {
    const item = useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    useOutbox.setState((s) => ({
      items: s.items.map((i) => ({ ...i, syncState: "failed" as const })),
    }));
    useUndo.getState().arm({ kind: "edit", itemId: item.id, nodeId: 1, summary: item.summary });

    await useUndo.getState().perform();

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(useOutbox.getState().items).toEqual([]);
  });

  it("keeps the target and surfaces the error when the revert fails", async () => {
    apiFetchMock.mockResolvedValueOnce(
      fail({ error: "point was changed by someone else since your edit — undo aborted" }, 409),
    );
    const onUndone = vi.fn();
    const item = useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    useOutbox.setState((s) => ({
      items: s.items.map((i) => ({ ...i, syncState: "sent" as const, newVersion: 4 })),
    }));
    useUndo
      .getState()
      .arm({ kind: "edit", itemId: item.id, nodeId: 1, summary: item.summary, onUndone });

    await useUndo.getState().perform();

    expect(useUndo.getState().error).toContain("changed by someone else");
    expect(useUndo.getState().target).not.toBeNull();
    expect(onUndone).not.toHaveBeenCalled();
    expect(useOutbox.getState().items).toHaveLength(1); // record kept: nothing was undone
  });

  it("dismisses silently when the item is gone (queue cleared)", async () => {
    useUndo.getState().arm({ kind: "edit", itemId: "gone", nodeId: 1, summary: "s" });

    await useUndo.getState().perform();

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(useUndo.getState().target).toBeNull();
    expect(useUndo.getState().error).toBeNull();
  });
});

describe("perform — create", () => {
  it("always reverts through OSM (the node exists before the toast shows)", async () => {
    apiFetchMock.mockResolvedValueOnce(ok({ changesetId: 9, newVersion: 2, nodeId: 42 }));
    const onUndone = vi.fn();
    useOutbox.getState().setChangeset(7);
    useUndo
      .getState()
      .arm({ kind: "create", nodeId: 42, sentVersion: 1, summary: "added", onUndone });

    await useUndo.getState().perform();

    const [url, init] = apiFetchMock.mock.calls[0];
    expect(url).toBe("/api/osm/revert");
    expect(JSON.parse(init?.body as string)).toEqual({
      nodeId: 42,
      kind: "create",
      sentVersion: 1,
      changesetId: 7,
    });
    expect(onUndone).toHaveBeenCalledOnce();
    expect(useUndo.getState().target).toBeNull();
  });
});

describe("dismiss", () => {
  it("clears the toast and releases any held edit to flush", () => {
    const flush = vi.spyOn(useOutbox.getState(), "flush").mockResolvedValue();
    useUndo.getState().arm({ kind: "edit", itemId: "a", nodeId: 1, summary: "s" });

    useUndo.getState().dismiss();

    expect(useUndo.getState().target).toBeNull();
    expect(flush).toHaveBeenCalled();
    flush.mockRestore();
  });
});
