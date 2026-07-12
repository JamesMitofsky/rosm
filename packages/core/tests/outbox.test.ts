import { beforeEach, describe, expect, it, vi } from "vitest";
import { outboxCounts, useOutbox, UNDO_WINDOW_MS, type OutboxItem } from "../src/stores/outbox";
import { editSummary, todayLocal } from "../src/editSummary";
import { configureTestPorts } from "./helpers/ports";

// The store reads its storage + api through injected ports; tests wire spy-backed
// fakes via configureTestPorts and assert against them.
let apiFetchMock: ReturnType<typeof configureTestPorts>["apiFetch"];
let storage: ReturnType<typeof configureTestPorts>["outboxStorage"];

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const fail = (body: unknown, status = 500) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function storedItem(over: Partial<OutboxItem>): OutboxItem {
  return {
    id: "id-x",
    nodeId: 1,
    action: "confirm",
    tagKey: "amenity",
    summary: "s",
    syncState: "pending",
    attempts: 0,
    createdAt: "2026-07-04T10:00:00.000Z",
    ...over,
  };
}

// Fresh enqueues carry a 5s undo hold that flush respects; most tests care about
// the send itself, so expire the holds up front.
const releaseHolds = () =>
  useOutbox.setState((s) => ({
    items: s.items.map((i) => ({ ...i, holdUntil: "2000-01-01T00:00:00.000Z" })),
  }));

beforeEach(() => {
  const ports = configureTestPorts();
  apiFetchMock = ports.apiFetch;
  storage = ports.outboxStorage;
  useOutbox.setState({ items: [], changesetId: undefined, hydrated: false });
});

describe("enqueue", () => {
  it("records a pending item with the optimistic summary and persists it", () => {
    const item = useOutbox.getState().enqueue({
      nodeId: 42,
      action: "out_of_order",
      tagKey: "amenity",
      name: "Fountain X",
      extras: { note: "leaking" },
    });

    expect(item.syncState).toBe("pending");
    expect(item.attempts).toBe(0);
    // Undo window: held back from flushing for UNDO_WINDOW_MS.
    expect(new Date(item.holdUntil as string).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(item.holdUntil as string).getTime()).toBeLessThanOrEqual(
      Date.now() + UNDO_WINDOW_MS,
    );
    expect(item.summary).toBe(
      editSummary("out_of_order", "amenity", todayLocal(), { note: "leaking" }),
    );
    expect(useOutbox.getState().items).toEqual([item]);
    expect(storage.put).toHaveBeenCalledWith(item);
  });

  it("gives every item a unique id", () => {
    const a = useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    const b = useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    expect(a.id).not.toBe(b.id);
  });
});

describe("flush", () => {
  it("sends pending edits one by one and shares the changeset from the first response", async () => {
    // Fresh Response per call — a shared body can only be consumed once.
    apiFetchMock.mockImplementation(async () =>
      ok({ changesetId: 42, newVersion: 2, changesetUrl: "cs-url" }),
    );
    useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    useOutbox.getState().enqueue({ nodeId: 2, action: "removed", tagKey: "amenity" });
    releaseHolds();

    await useOutbox.getState().flush();

    const items = useOutbox.getState().items;
    expect(items.map((i) => i.syncState)).toEqual(["sent", "sent"]);
    expect(items.map((i) => i.changesetId)).toEqual([42, 42]);
    expect(items[0].newVersion).toBe(2);
    expect(items[0].changesetUrl).toBe("cs-url");
    expect(useOutbox.getState().changesetId).toBe(42);
    expect(storage.setMeta).toHaveBeenCalledWith("changesetId", 42);

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(apiFetchMock.mock.calls[0][1]?.body as string);
    expect(firstBody).toMatchObject({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    expect(firstBody.changesetId).toBeUndefined();
    const secondBody = JSON.parse(apiFetchMock.mock.calls[1][1]?.body as string);
    expect(secondBody.changesetId).toBe(42); // reuses the opened changeset
  });

  it("marks an item failed with the server error and counts the attempt", async () => {
    apiFetchMock.mockImplementation(async () => fail({ error: "boom" }));
    useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    releaseHolds();

    await useOutbox.getState().flush();

    const [item] = useOutbox.getState().items;
    expect(item.syncState).toBe("failed");
    expect(item.attempts).toBe(1);
    expect(item.error).toBe("boom");
  });

  it("unwraps zod formErrors into a readable message", async () => {
    apiFetchMock.mockImplementation(async () =>
      fail({ error: { formErrors: ["bad node", "bad action"] } }, 400),
    );
    useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    releaseHolds();

    await useOutbox.getState().flush();
    expect(useOutbox.getState().items[0].error).toBe("bad node, bad action");
  });

  it("leaves failed items alone on subsequent flushes", async () => {
    apiFetchMock.mockImplementation(async () => fail({ error: "boom" }));
    useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    releaseHolds();
    await useOutbox.getState().flush();
    apiFetchMock.mockClear();

    await useOutbox.getState().flush();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("does nothing while offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });

    await useOutbox.getState().flush();
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(useOutbox.getState().items[0].syncState).toBe("pending");
  });

  it("runs a single flush loop at a time", async () => {
    let release!: (r: Response) => void;
    apiFetchMock.mockImplementation(() => new Promise<Response>((resolve) => (release = resolve)));
    useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    releaseHolds();

    const first = useOutbox.getState().flush();
    const second = useOutbox.getState().flush(); // lock: returns immediately
    release(ok({ changesetId: 1, newVersion: 1, changesetUrl: "u" }));
    await Promise.all([first, second]);

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("undo hold window", () => {
  it("flush skips items whose hold hasn't lapsed", async () => {
    apiFetchMock.mockImplementation(async () =>
      ok({ changesetId: 1, newVersion: 2, changesetUrl: "u" }),
    );
    useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });

    await useOutbox.getState().flush();

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(useOutbox.getState().items[0].syncState).toBe("pending");
  });

  it("flush schedules a follow-up send for when the earliest hold expires", async () => {
    vi.useFakeTimers();
    try {
      apiFetchMock.mockImplementation(async () =>
        ok({ changesetId: 1, newVersion: 2, changesetUrl: "u" }),
      );
      useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });

      await useOutbox.getState().flush();
      expect(apiFetchMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100);
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      expect(useOutbox.getState().items[0].syncState).toBe("sent");
    } finally {
      vi.useRealTimers();
    }
  });

  it("flush sends items whose hold has already lapsed (e.g. after a reload)", async () => {
    apiFetchMock.mockImplementation(async () =>
      ok({ changesetId: 1, newVersion: 2, changesetUrl: "u" }),
    );
    useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    releaseHolds();

    await useOutbox.getState().flush();
    expect(useOutbox.getState().items[0].syncState).toBe("sent");
  });
});

describe("cancel / remove", () => {
  it("cancel drops a pending item from memory and IndexedDB", () => {
    const item = useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });

    expect(useOutbox.getState().cancel(item.id)).toBe(true);
    expect(useOutbox.getState().items).toEqual([]);
    expect(storage.delete).toHaveBeenCalledWith(item.id);
  });

  it("cancel refuses anything past pending", () => {
    const item = useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    useOutbox.setState((s) => ({
      items: s.items.map((i) => ({ ...i, syncState: "sent" as const })),
    }));

    expect(useOutbox.getState().cancel(item.id)).toBe(false);
    expect(useOutbox.getState().items).toHaveLength(1);
  });

  it("cancel returns false for an unknown id", () => {
    expect(useOutbox.getState().cancel("nope")).toBe(false);
  });

  it("remove drops an item regardless of sync state", () => {
    const item = useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    useOutbox.setState((s) => ({
      items: s.items.map((i) => ({ ...i, syncState: "sent" as const })),
    }));

    useOutbox.getState().remove(item.id);
    expect(useOutbox.getState().items).toEqual([]);
    expect(storage.delete).toHaveBeenCalledWith(item.id);
  });
});

describe("retryAll", () => {
  it("re-arms failed items and flushes them again", async () => {
    apiFetchMock.mockResolvedValueOnce(fail({ error: "first try failed" }));
    useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    releaseHolds();
    await useOutbox.getState().flush();
    expect(useOutbox.getState().items[0].syncState).toBe("failed");

    apiFetchMock.mockResolvedValueOnce(ok({ changesetId: 8, newVersion: 3, changesetUrl: "u" }));
    await useOutbox.getState().retryAll();

    const [item] = useOutbox.getState().items;
    expect(item.syncState).toBe("sent");
    expect(item.attempts).toBe(2);
    expect(item.error).toBeUndefined();
    expect(item.holdUntil).toBeUndefined(); // explicit resend: undo hold dropped
  });
});

describe("hydrate", () => {
  it("loads persisted items sorted by creation, resetting interrupted sends", async () => {
    storage.getAll.mockResolvedValueOnce([
      storedItem({ id: "b", createdAt: "2026-07-04T11:00:00.000Z", syncState: "sending" }),
      storedItem({ id: "a", createdAt: "2026-07-04T10:00:00.000Z", syncState: "sent" }),
      storedItem({ id: "c", createdAt: "2026-07-04T12:00:00.000Z", syncState: "failed" }),
    ]);
    storage.getMeta.mockResolvedValueOnce(77);

    await useOutbox.getState().hydrate();

    const s = useOutbox.getState();
    expect(s.hydrated).toBe(true);
    expect(s.changesetId).toBe(77);
    expect(s.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(s.items.map((i) => i.syncState)).toEqual(["sent", "pending", "failed"]);
  });

  it("only hydrates once", async () => {
    await useOutbox.getState().hydrate();
    await useOutbox.getState().hydrate();
    expect(storage.getAll).toHaveBeenCalledTimes(1);
  });
});

describe("clear", () => {
  it("wipes items, changeset and the persisted queue", async () => {
    useOutbox.getState().enqueue({ nodeId: 1, action: "confirm", tagKey: "amenity" });
    useOutbox.getState().setChangeset(9);

    await useOutbox.getState().clear();

    expect(useOutbox.getState().items).toEqual([]);
    expect(useOutbox.getState().changesetId).toBeUndefined();
    expect(storage.clear).toHaveBeenCalled();
    expect(storage.setMeta).toHaveBeenLastCalledWith("changesetId", undefined);
  });
});

describe("outboxCounts", () => {
  it("derives review counts, treating everything unconfirmed as unsent", () => {
    const items = [
      storedItem({ id: "1", syncState: "sent" }),
      storedItem({ id: "2", syncState: "sent" }),
      storedItem({ id: "3", syncState: "pending" }),
      storedItem({ id: "4", syncState: "sending" }),
      storedItem({ id: "5", syncState: "failed" }),
    ];
    expect(outboxCounts(items)).toEqual({
      sent: 2,
      pending: 1,
      sending: 1,
      failed: 1,
      unsent: 3,
      total: 5,
    });
  });

  it("handles an empty outbox", () => {
    expect(outboxCounts([])).toEqual({
      sent: 0,
      pending: 0,
      sending: 0,
      failed: 0,
      unsent: 0,
      total: 0,
    });
  });
});
