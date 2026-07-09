"use client";

import Link from "next/link";
import { CaretRightIcon, CloudCheckIcon, CloudSlashIcon } from "@phosphor-icons/react";
import type { ArchivedRoute } from "@/lib/routeArchive";
import { outboxCounts } from "@/store/outbox";
import { fmtDist } from "@/lib/geo";

// Every run this device has recorded, newest first, each linking to its replay.
export default function RunHistoryList({ routes }: { routes: ArchivedRoute[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold">Run history</h2>
      {routes.length === 0 ? (
        <p className="text-ink-dim text-sm">No runs on this device yet.</p>
      ) : (
        <ul className="divide-paper-line flex flex-col divide-y">
          {routes.map((r) => (
            <RunHistoryCard key={r.routeId} route={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RunHistoryCard({ route }: { route: ArchivedRoute }) {
  const { plan, edits } = route;
  const surveyed = plan.stops.filter((s) => s.status !== "pending" && s.status !== "skipped");
  const sync = outboxCounts(edits);
  const date = new Date(route.startedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <li>
      <Link
        href={`/mapping-portal/run-detail?id=${route.routeId}`}
        className="hover:bg-paper-deep/50 -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold">
            {date}
            <span className="text-ink-dim ml-2 font-normal">{fmtDist(plan.distanceM)}</span>
          </span>
          <span className="text-ink-dim text-xs">
            {surveyed.length} of {plan.stops.length} {plan.stops.length === 1 ? "stop" : "stops"}{" "}
            surveyed
            {edits.length > 0 && ` · ${edits.length} ${edits.length === 1 ? "edit" : "edits"}`}
          </span>
        </div>
        {edits.length > 0 &&
          (sync.unsent === 0 ? (
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-green-700">
              <CloudCheckIcon size={14} /> sent
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600">
              <CloudSlashIcon size={14} /> {sync.unsent} unsent
            </span>
          ))}
        <CaretRightIcon size={16} className="text-ink-dim shrink-0" />
      </Link>
    </li>
  );
}
