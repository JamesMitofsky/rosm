"use client";

import { useCallback, useMemo, useState } from "react";
import type { EditAction, EditExtras } from "@/lib/schemas";
import type { StopStatus } from "@/store/run";
import type { PointEdit } from "@/components/PointPopup";
import { useOutbox, outboxCounts } from "@/store/outbox";
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
  // so marker memos can list it as an honest dependency.
  const updatePoint = useCallback(
    (nodeId: number, action: EditAction, name?: string, extras?: EditExtras) => {
      onError?.(null);
      useOutbox.getState().enqueue({ nodeId, action, tagKey, name, extras });
      celebratePoint();
      useOutbox.getState().flush();
    },
    [tagKey, onError],
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
    closeEdits,
    closingEdits,
    changesetId,
    editCount: Object.keys(edits).length,
    outboxUnsent: outboxCounts(outboxItems).unsent,
  };
}

export type OsmEdits = ReturnType<typeof useOsmEdits>;
