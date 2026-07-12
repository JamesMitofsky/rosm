"use client";

import { useCallback, useMemo, useState } from "react";
import type { EditAction, EditExtras, Fountain, TagFilter } from "@/lib/schemas";
import type { Pt } from "@/lib/geo";
import type { StopStatus } from "@/store/run";
import type { PointEdit } from "@/components/PointPopup";
import { useOutbox, outboxCounts } from "@/store/outbox";
import { useUndo } from "@/store/undo";
import { celebratePoint } from "@/lib/confetti";
import { apiFetch } from "@/lib/api";

// Direct OSM edits made from a map, outside a run. Backed by the offline
// outbox: saved on-device first, sent to OSM in the background, batched into
// one changeset (opened by the API on the first successful send).
//
// `onError` lets the host page surface edit/close failures in its own error
// slot (and clear it when a new edit starts), matching the previous inline
// behavior on the planner and the fountain browser.
export function useOsmEdits({
  tagKey,
  onError,
}: {
  tagKey: string;
  onError?: (msg: string | null) => void;
}) {
  const outboxItems = useOutbox((s) => s.items);
  const changesetId = useOutbox((s) => s.changesetId);
  const [closingEdits, setClosingEdits] = useState(false);

  // Latest queued edit per node, for the marker color/label + popup feedback.
  const edits = useMemo(() => {
    const m: Record<number, PointEdit> = {};
    for (const it of outboxItems) {
      m[it.nodeId] = {
        status: it.action as StopStatus,
        summary: it.summary,
        syncState: it.syncState,
        changesetUrl: it.changesetUrl,
        extras: it.extras,
      };
    }
    return m;
  }, [outboxItems]);

  // Update a point straight from the map. Offline-first: queued on-device and
  // celebrated immediately, then sent to OSM in the background. Stable identity
  // so marker memos can list it as an honest dependency. Arms the 5s undo toast;
  // no rollback callback needed — the popup and marker styling derive from the
  // outbox items, so removing the item on undo reverts the UI by itself.
  const updatePoint = useCallback(
    (nodeId: number, action: EditAction, name?: string, extras?: EditExtras) => {
      onError?.(null);
      const item = useOutbox.getState().enqueue({ nodeId, action, tagKey, name, extras });
      celebratePoint();
      useUndo.getState().arm({ kind: "edit", itemId: item.id, nodeId, summary: item.summary });
      useOutbox.getState().flush();
    },
    [tagKey, onError],
  );

  // Create a brand-new OSM node straight from the map (tap-to-add). Online-only
  // (needs the fresh node id back from OSM) — unlike updatePoint there's nothing
  // to queue, so failures surface immediately via onError. Extras carry the
  // survey facts (audience/seasonal/note) so the node is born fully described.
  // Shares the outbox's changeset so the create lands with this session's
  // edits, and returns the new node as a Fountain so the caller can drop it
  // onto the map. The create is on OSM before the undo toast even shows, so
  // undo deletes the node again — `onUndone` lets the caller drop it from its
  // local state too.
  const createPoint = useCallback(
    async (
      at: Pt,
      tag: TagFilter,
      extras?: EditExtras,
      onUndone?: (nodeId: number) => void,
    ): Promise<Fountain | null> => {
      onError?.(null);
      try {
        const r = await apiFetch("/api/osm/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: at.lat,
            lon: at.lon,
            tag,
            changesetId: useOutbox.getState().changesetId,
            extras,
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "create failed");
        useOutbox.getState().setChangeset(j.changesetId);
        celebratePoint();
        useUndo.getState().arm({
          kind: "create",
          nodeId: j.nodeId,
          sentVersion: 1,
          summary: j.summary,
          onUndone: () => onUndone?.(j.nodeId),
        });
        return { id: j.nodeId, lat: j.lat, lon: j.lon, tags: j.tags };
      } catch (e) {
        onError?.((e as Error).message);
        return null;
      }
    },
    [onError],
  );

  // Close the open edit changeset so it's not left dangling on OSM.
  async function closeEdits() {
    const id = useOutbox.getState().changesetId;
    if (!id) return;
    setClosingEdits(true);
    onError?.(null);
    try {
      const r = await apiFetch("/api/osm/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changesetId: id }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "close failed");
      useOutbox.getState().setChangeset(undefined);
    } catch (e) {
      onError?.((e as Error).message);
    } finally {
      setClosingEdits(false);
    }
  }

  return {
    edits,
    updatePoint,
    createPoint,
    closeEdits,
    closingEdits,
    changesetId,
    editCount: Object.keys(edits).length,
    outboxUnsent: outboxCounts(outboxItems).unsent,
  };
}

export type OsmEdits = ReturnType<typeof useOsmEdits>;
