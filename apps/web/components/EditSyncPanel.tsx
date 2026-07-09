"use client";

import SyncStatus from "@/components/SyncStatus";
import type { OsmEdits } from "@/hooks/useOsmEdits";

// Offline-first review of direct map edits: what reached OSM + retry missed
// sends, plus closing the shared changeset. Renders nothing until an edit has
// been made this session. Shared by the planner and the fountain browser.
export default function EditSyncPanel({ osmEdits }: { osmEdits: OsmEdits }) {
  const { editCount, changesetId, closeEdits, closingEdits, outboxUnsent } = osmEdits;
  if (editCount === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <SyncStatus tone="light" />
      {changesetId && (
        <button
          onClick={closeEdits}
          disabled={closingEdits || outboxUnsent > 0}
          className="border-paper-line text-ink-dim hover:border-sky-deep/60 hover:text-sky-deep w-full rounded-sm border py-1.5 text-xs font-semibold transition disabled:opacity-40"
        >
          {closingEdits ? "Closing changeset…" : "Close changeset"}
        </button>
      )}
    </div>
  );
}
