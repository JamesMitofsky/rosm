import { create } from "zustand";
import type { EditAction, EditExtras } from "@/lib/schemas";
import { editSummary, todayLocal } from "@/lib/editSummary";
import { idbGetAll, idbPut, idbClearOutbox, idbGetMeta, idbSetMeta } from "@/lib/idb";
import { apiFetch } from "@/lib/api";

// Where a queued edit is in its journey to OSM.
//   pending  — written locally, not yet sent (offline, or just enqueued)
//   sending  — POST in flight
//   sent     — accepted by OSM
//   failed   — POST failed (offline mid-send, server/network error); retryable
export type SyncState = "pending" | "sending" | "sent" | "failed";

// One recorded modification. Saved to IndexedDB the instant the user acts, so the
// confetti fires immediately and the edit survives a reload / offline period.
export type OutboxItem = {
  id: string;
  nodeId: number;
  action: EditAction;
  tagKey: string;
  name?: string; // for the review list
  extras?: EditExtras; // advanced OSM tags (seasonal, note)
  summary: string; // computed locally at enqueue, matches the server's wording
  syncState: SyncState;
  attempts: number;
  createdAt: string;
  error?: string;
  // Filled once OSM accepts the edit:
  changesetId?: number;
  newVersion?: number;
  changesetUrl?: string;
};

const CHANGESET_META = "changesetId";

// Module-level lock so only one flush loop runs at a time — edits send one by one
// and share a single changeset (the first send opens it, the rest reuse the id).
let flushing = false;

type EnqueueInput = {
  nodeId: number;
  action: EditAction;
  tagKey: string;
  name?: string;
  extras?: EditExtras;
};

type OutboxState = {
  items: OutboxItem[];
  changesetId?: number;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  enqueue: (input: EnqueueInput) => OutboxItem;
  flush: () => Promise<void>;
  retryAll: () => Promise<void>;
  setChangeset: (id: number | undefined) => void;
  clear: () => Promise<void>;
};

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export const useOutbox = create<OutboxState>((set, get) => {
  // Persist a single item to IndexedDB and patch it into the in-memory list.
  const persist = (item: OutboxItem) => {
    set((s) => ({ items: s.items.map((i) => (i.id === item.id ? item : i)) }));
    idbPut(item);
  };

  return {
    items: [],
    changesetId: undefined,
    hydrated: false,

    // Load the queue from IndexedDB on app start. Any "sending" item is from a
    // session that was interrupted mid-POST — reset it to pending so it retries.
    hydrate: async () => {
      if (get().hydrated) return;
      const [stored, changesetId] = await Promise.all([
        idbGetAll<OutboxItem>(),
        idbGetMeta<number>(CHANGESET_META),
      ]);
      const items = stored
        .map((i) => (i.syncState === "sending" ? { ...i, syncState: "pending" as const } : i))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      items.forEach((i) => {
        if (i.syncState === "pending") idbPut(i);
      });
      set({ items, changesetId, hydrated: true });
    },

    // Record an edit locally. Returns the item so the caller can fire confetti and
    // reflect it in the UI immediately, before the network is ever touched.
    enqueue: (input) => {
      const item: OutboxItem = {
        id: uuid(),
        nodeId: input.nodeId,
        action: input.action,
        tagKey: input.tagKey,
        name: input.name,
        extras: input.extras,
        summary: editSummary(input.action, input.tagKey, todayLocal(), input.extras),
        syncState: "pending",
        attempts: 0,
        createdAt: new Date().toISOString(),
      };
      set((s) => ({ items: [...s.items, item] }));
      idbPut(item);
      return item;
    },

    // Send every pending edit to OSM, one at a time, sharing one changeset. Failed
    // items are left alone (retry happens via retryAll); only fresh pending items
    // are picked up here.
    flush: async () => {
      if (flushing) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      flushing = true;
      try {
        const ids = get()
          .items.filter((i) => i.syncState === "pending")
          .map((i) => i.id);
        for (const id of ids) {
          const item = get().items.find((i) => i.id === id);
          if (!item || item.syncState !== "pending") continue;

          persist({ ...item, syncState: "sending" });
          try {
            const r = await apiFetch("/api/osm/edit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                nodeId: item.nodeId,
                action: item.action,
                tagKey: item.tagKey,
                extras: item.extras,
                changesetId: get().changesetId,
              }),
            });
            const j = await r.json();
            if (!r.ok) {
              throw new Error(j.error?.formErrors?.join(", ") || j.error || "edit failed");
            }
            get().setChangeset(j.changesetId);
            persist({
              ...item,
              syncState: "sent",
              attempts: item.attempts + 1,
              changesetId: j.changesetId,
              newVersion: j.newVersion,
              changesetUrl: j.changesetUrl,
              error: undefined,
            });
          } catch (e) {
            persist({
              ...item,
              syncState: "failed",
              attempts: item.attempts + 1,
              error: (e as Error).message,
            });
          }
        }
      } finally {
        flushing = false;
      }
    },

    // "Retry all missed sends": re-arm every failed edit and flush again.
    retryAll: async () => {
      const failed = get().items.filter((i) => i.syncState === "failed");
      failed.forEach((i) => persist({ ...i, syncState: "pending", error: undefined }));
      await get().flush();
    },

    setChangeset: (id) => {
      set({ changesetId: id });
      idbSetMeta(CHANGESET_META, id);
    },

    // Wipe the queue + changeset (e.g. when a run is fully done and reset).
    clear: async () => {
      set({ items: [], changesetId: undefined });
      await idbClearOutbox();
      await idbSetMeta(CHANGESET_META, undefined);
    },
  };
});

// Derived counts for the review UI.
export function outboxCounts(items: OutboxItem[]) {
  let sent = 0,
    pending = 0,
    sending = 0,
    failed = 0;
  for (const i of items) {
    if (i.syncState === "sent") sent++;
    else if (i.syncState === "failed") failed++;
    else if (i.syncState === "sending") sending++;
    else pending++;
  }
  // "unsent" = anything not yet confirmed by OSM.
  return { sent, pending, sending, failed, unsent: pending + sending + failed, total: items.length };
}
