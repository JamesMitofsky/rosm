import { create } from "zustand";
import { useOutbox, UNDO_WINDOW_MS } from "@/store/outbox";
import { apiFetch } from "@/lib/api";

// The one submission currently offered for undo. Latest-only: a new submission
// replaces the previous target (its window is over — that edit just flushes).
export type UndoTarget = {
  kind: "edit" | "create";
  nodeId: number;
  summary: string; // shown in the toast ("Saved · …")
  itemId?: string; // outbox id (kind "edit") — drives cancel vs revert
  sentVersion?: number; // version the submission produced (creates: 1)
  expiresAt: number; // epoch ms: when the window closes
  onUndone?: () => void; // caller-supplied local UI rollback
};

type UndoState = {
  target: UndoTarget | null;
  busy: boolean;
  error: string | null;
  arm: (t: Omit<UndoTarget, "expiresAt">) => void;
  dismiss: () => void;
  perform: () => Promise<void>;
};

// Authoritative window timer. Module-level (not a React effect) so navigating
// away mid-window can't orphan a held outbox item — expiry always releases it.
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

// An in-flight send must settle before we can decide between cancel and revert —
// never yank an item out from under its POST. Resolves when the item leaves
// "sending" (or disappears); rejects if the send hangs past the timeout.
function settled(itemId: string, timeoutMs = 30_000): Promise<void> {
  const item = useOutbox.getState().items.find((i) => i.id === itemId);
  if (!item || item.syncState !== "sending") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const stop = setTimeout(() => {
      unsub();
      reject(new Error("send still in flight — try again in a moment"));
    }, timeoutMs);
    const unsub = useOutbox.subscribe((s) => {
      const it = s.items.find((i) => i.id === itemId);
      if (!it || it.syncState !== "sending") {
        clearTimeout(stop);
        unsub();
        resolve();
      }
    });
  });
}

// Undo a submission that already reached OSM: previous version restored (edit)
// or node deleted (create), as a new changeset entry.
async function revertRemote(nodeId: number, kind: "edit" | "create", sentVersion: number) {
  const r = await apiFetch("/api/osm/revert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nodeId,
      kind,
      sentVersion,
      changesetId: useOutbox.getState().changesetId,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.formErrors?.join(", ") || j.error || "undo failed");
  if (j.changesetId) useOutbox.getState().setChangeset(j.changesetId);
}

export const useUndo = create<UndoState>((set, get) => ({
  target: null,
  busy: false,
  error: null,

  // Offer undo for a fresh submission. When the window lapses the toast clears
  // and the outbox flushes, releasing the held edit to OSM — unless an undo is
  // mid-flight or showing an error, which the user must see out.
  arm: (t) => {
    clearTimeout(expiryTimer);
    set({ target: { ...t, expiresAt: Date.now() + UNDO_WINDOW_MS }, busy: false, error: null });
    expiryTimer = setTimeout(() => {
      if (!get().busy && !get().error) set({ target: null });
      useOutbox.getState().flush();
    }, UNDO_WINDOW_MS);
  },

  dismiss: () => {
    clearTimeout(expiryTimer);
    set({ target: null, busy: false, error: null });
    useOutbox.getState().flush();
  },

  // The undo itself. Cheap path: the edit is still held in the outbox → cancel
  // locally, nothing ever reaches OSM. Otherwise (creates, or an edit that
  // slipped out) → revert through OSM. Failures stay in the toast; the target is
  // kept so the user can retry or dismiss.
  perform: async () => {
    const t = get().target;
    if (!t || get().busy) return;
    set({ busy: true, error: null });
    try {
      if (t.kind === "edit" && t.itemId) {
        await settled(t.itemId);
        const item = useOutbox.getState().items.find((i) => i.id === t.itemId);
        if (item?.syncState === "sent") {
          if (item.newVersion == null) throw new Error("missing version — cannot undo");
          await revertRemote(t.nodeId, "edit", item.newVersion);
          useOutbox.getState().remove(item.id);
          t.onUndone?.();
        } else if (item) {
          // pending (held or offline) or failed: the edit never landed — drop it.
          useOutbox.getState().remove(item.id);
          t.onUndone?.();
        }
        // Item gone entirely (queue cleared): nothing to undo — just close.
      } else {
        await revertRemote(t.nodeId, t.kind, t.sentVersion ?? 1);
        t.onUndone?.();
      }
      clearTimeout(expiryTimer);
      set({ target: null, busy: false, error: null });
    } catch (e) {
      set({ busy: false, error: (e as Error).message });
    }
  },
}));
