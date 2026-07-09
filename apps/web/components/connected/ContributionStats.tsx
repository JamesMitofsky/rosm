"use client";

import type { ArchivedRoute } from "@/lib/routeArchive";
import { EDIT_LABEL, EDIT_COLOR } from "@/lib/editStatus";
import { fmtDist } from "@/lib/geo";
import type { StopStatus } from "@/store/run";

const ACTION_LABEL: Partial<Record<StopStatus, string>> = {
  confirm: "Working",
  dog_only: "Dog water",
  out_of_order: "Out of order",
  removed: "Removed",
};

// What all those runs added up to, aggregated from the on-device archive.
export default function ContributionStats({ routes }: { routes: ArchivedRoute[] }) {
  if (routes.length === 0) return null;

  const totalDistM = routes.reduce((sum, r) => sum + (r.plan.distanceM || 0), 0);
  const byAction: Partial<Record<StopStatus, number>> = {};
  let totalEdits = 0;
  for (const r of routes) {
    for (const e of r.edits) {
      const a = e.action as StopStatus;
      byAction[a] = (byAction[a] ?? 0) + 1;
      totalEdits++;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold">Your contributions</h2>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Stat label={routes.length === 1 ? "run" : "runs"} value={String(routes.length)} />
        <Stat label="surveyed" value={fmtDist(totalDistM)} />
        <Stat
          label={totalEdits === 1 ? "point updated" : "points updated"}
          value={String(totalEdits)}
        />
      </div>
      {totalEdits > 0 && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ACTION_LABEL) as StopStatus[]).map((a) => {
            const n = byAction[a];
            if (!n) return null;
            return (
              <span
                key={a}
                className="border-paper-line flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
              >
                <span style={{ color: EDIT_COLOR[a] }}>{EDIT_LABEL[a]}</span>
                {ACTION_LABEL[a]}
                <span className="text-ink-dim/70 font-normal">{n}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-display text-xl font-bold">{value}</span>
      <span className="text-ink-dim text-xs">{label}</span>
    </span>
  );
}
