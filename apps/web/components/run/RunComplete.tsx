"use client";

import Link from "next/link";
import { FlagCheckeredIcon } from "@phosphor-icons/react";
import type { RunSession } from "@/hooks/useRunSession";
import { useOutbox, outboxCounts } from "@/store/outbox";
import { useRun } from "@/store/run";
import SyncStatus from "@/components/SyncStatus";
import { canShare, shareRun } from "@/lib/share";

type Tone = "light" | "dark";

const TONE = {
  light: {
    flag: "text-green-600",
    list: "text-ink-dim",
    link: "text-sky-deep",
    primary: "bg-ink text-paper hover:bg-ink-soft",
    note: "text-ink-dim",
    err: "bg-red-50 text-red-700",
  },
  dark: {
    flag: "text-volt",
    list: "text-cream-dim",
    link: "text-volt",
    primary: "bg-volt text-ink",
    note: "text-cream-dim",
    err: "border border-red-500/30 bg-red-500/10 text-red-300",
  },
} as const;

// The run wrap-up: tally, offline-sync review, JSON backup, and the
// close-changeset → done flow. `onExit` is what "Done" does — navigate home on
// the standalone page, or drop back to the planner inline.
export default function RunComplete({
  session,
  tone = "light",
  onExit,
}: {
  session: RunSession;
  tone?: Tone;
  onExit: () => void;
}) {
  const t = TONE[tone];
  const outboxItems = useOutbox((s) => s.items);
  // For "View this run": the archive is keyed by this id and already durably
  // written, so the link works even after the stores reset.
  const routeId = useRun((s) => s.routeId);
  const { stops, finishing, finishErr, closed, finish } = session;

  const counts = stops.reduce<Record<string, number>>((a, s) => {
    a[s.status] = (a[s.status] || 0) + 1;
    return a;
  }, {});
  const editCount =
    (counts.confirm || 0) +
    (counts.dog_only || 0) +
    (counts.out_of_order || 0) +
    (counts.removed || 0) +
    (counts.delete || 0);
  const sealed = closed !== null;
  const sync = outboxCounts(outboxItems);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-6 text-center">
      <FlagCheckeredIcon size={56} className={t.flag} />
      <h1 className="text-2xl font-bold">{sealed ? "Changeset closed" : "Run complete"}</h1>
      <ul className={`text-sm ${t.list}`}>
        <li>Confirmed: {counts.confirm || 0}</li>
        <li>Dog water: {counts.dog_only || 0}</li>
        <li>Out of order: {counts.out_of_order || 0}</li>
        <li>Removed: {(counts.removed || 0) + (counts.delete || 0)}</li>
        <li>Skipped: {counts.skipped || 0}</li>
      </ul>

      {/* Review what reached OSM and retry anything that missed. */}
      <SyncStatus tone={tone} />

      {sealed ? (
        <>
          {closed?.changesetUrl && (
            <a
              href={closed.changesetUrl}
              target="_blank"
              rel="noreferrer"
              className={`font-medium underline underline-offset-2 ${t.link}`}
            >
              View {editCount} {editCount === 1 ? "edit" : "edits"} on OpenStreetMap →
            </a>
          )}
          {closed?.changesetUrl && canShare() && (
            <button
              onClick={() =>
                shareRun(
                  closed.changesetUrl!,
                  `I surveyed ${editCount} OpenStreetMap ${editCount === 1 ? "point" : "points"} on a run with ROSM.`,
                )
              }
              className={`w-full rounded border py-3 font-semibold ${tone === "dark" ? "text-cream-dim border-white/15" : "border-neutral-300 text-neutral-700"}`}
            >
              Share run
            </button>
          )}
          {routeId && (
            <Link
              href={`/mapping-portal/run-detail?id=${routeId}`}
              className={`block w-full rounded py-3 text-center font-semibold ${t.primary}`}
            >
              View this run
            </Link>
          )}
          <button
            onClick={onExit}
            className={`w-full rounded border py-3 font-semibold ${tone === "dark" ? "text-cream-dim border-white/15" : "border-neutral-300 text-neutral-700"}`}
          >
            Plan another route
          </button>
        </>
      ) : (
        <>
          <button
            onClick={finish}
            disabled={finishing || sync.unsent > 0}
            className={`w-full rounded py-3 font-semibold disabled:opacity-50 ${t.primary}`}
          >
            {finishing ? "Closing changeset…" : "Close changeset & finish"}
          </button>
          {sync.unsent > 0 && (
            <p className={`w-full text-sm ${t.note}`}>
              Send the remaining {sync.unsent} {sync.unsent === 1 ? "edit" : "edits"} before closing
              the changeset.
            </p>
          )}
          {finishErr && <p className={`w-full rounded p-2 text-sm ${t.err}`}>{finishErr}</p>}
        </>
      )}
    </div>
  );
}
