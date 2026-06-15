"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircleIcon,
  WarningIcon,
  TrashIcon,
  ArrowUpIcon,
  SkipForwardIcon,
  PlusCircleIcon,
} from "@phosphor-icons/react";
import type { RunSession } from "@/hooks/useRunSession";
import { fmtDist } from "@/lib/geo";
import SyncStatus from "@/components/SyncStatus";

type Tone = "light" | "dark";

// Theme tokens so the run guidance can live both on the standalone /run page
// (light) and inline in the dark planner shell without forking the markup.
const TONE = {
  light: {
    card: "border-neutral-200 text-neutral-900",
    arrow: "text-blue-600",
    sub: "text-neutral-500",
    faint: "text-neutral-400",
    inspect: "bg-neutral-900 text-white",
    skip: "text-neutral-500",
    add: "border-green-500 text-green-700",
    saved: "bg-green-50 text-green-800",
    err: "bg-red-50 text-red-700",
    signin: "bg-blue-600 text-white",
  },
  dark: {
    card: "border-white/10 bg-ink-soft/60 text-cream",
    arrow: "text-volt",
    sub: "text-cream-dim",
    faint: "text-cream-dim/70",
    inspect: "bg-volt text-ink",
    skip: "text-cream-dim",
    add: "border-green-500/50 text-green-300",
    saved: "bg-green-500/10 text-green-300",
    err: "border border-red-500/30 bg-red-500/10 text-red-300",
    signin: "bg-volt text-ink",
  },
} as const;

// The active-run "bottom section": compass to the next stop, arrival actions,
// skip, add-here, last-saved feedback, and offline sync/export. Pure view —
// state and actions come from useRunSession.
export default function RunGuide({
  session,
  tone = "light",
}: {
  session: RunSession;
  tone?: Tone;
}) {
  const t = TONE[tone];
  const {
    index,
    target,
    distToTarget,
    bearingTo,
    heading,
    arrived,
    addLabel,
    added,
    osm,
    refresh,
    adding,
    err,
    lastSaved,
    setManualArrived,
    record,
    skip,
    addHere,
  } = session;

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-3"
        >
          <div className={`flex items-center gap-4 rounded-lg border p-4 ${t.card}`}>
            <ArrowUpIcon
              size={40}
              weight="bold"
              style={{ transform: `rotate(${bearingTo}deg)` }}
              className={`${t.arrow} transition-transform`}
            />
            <div>
              <div className="text-2xl font-bold">
                {distToTarget != null ? fmtDist(distToTarget) : "—"}
              </div>
              <div className={`text-sm ${t.sub}`}>
                head {heading} · {target?.tags?.name || `node ${target?.id}`}
              </div>
            </div>
          </div>

          {target?.tags?.check_date && (
            <p className={`text-xs ${t.faint}`}>Last checked in OSM: {target.tags.check_date}</p>
          )}

          {!osm?.loggedIn && (
            <a
              href="/api/osm/auth"
              className={`rounded py-2 text-center text-sm font-semibold ${t.signin}`}
              onClick={() => setTimeout(refresh, 1000)}
            >
              Sign in to OSM to record updates
            </a>
          )}

          {!arrived ? (
            <button
              onClick={() => setManualArrived(true)}
              className={`rounded py-3 font-semibold ${t.inspect}`}
            >
              I&apos;m here — inspect
            </button>
          ) : (
            <div className="grid gap-2">
              <button
                onClick={() => record("confirm")}
                className="flex items-center justify-center gap-2 rounded bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
              >
                <CheckCircleIcon size={20} /> Working — confirm (set check_date)
              </button>
              <button
                onClick={() => record("out_of_order")}
                className="flex items-center justify-center gap-2 rounded bg-amber-500 py-3 font-semibold text-white disabled:opacity-50"
              >
                <WarningIcon size={20} /> Out of order (disused:)
              </button>
              <button
                onClick={() => record("removed")}
                className="flex items-center justify-center gap-2 rounded bg-red-600 py-3 font-semibold text-white disabled:opacity-50"
              >
                <TrashIcon size={20} /> Removed (abandoned:)
              </button>
            </div>
          )}

          <button onClick={skip} className={`flex items-center justify-center gap-1 text-sm ${t.skip}`}>
            <SkipForwardIcon size={16} /> Skip this one
          </button>
        </motion.div>
      </AnimatePresence>

      {/* Add a new instance of the surveyed type at the current location.
          Always available — a passed-by point need not be the current stop. */}
      {osm?.loggedIn && (
        <button
          disabled={adding || !session.userPos}
          onClick={addHere}
          className={`flex items-center justify-center gap-2 rounded border border-dashed py-2.5 text-sm font-semibold disabled:opacity-50 ${t.add}`}
        >
          <PlusCircleIcon size={18} />
          Add {addLabel} here{added.length > 0 ? ` · ${added.length} added` : ""}
        </button>
      )}

      {lastSaved && (
        <div className={`flex items-center gap-2 rounded p-2 text-sm ${t.saved}`}>
          <CheckCircleIcon size={18} className="shrink-0" />
          <span className="flex-1 text-left">
            Saved · node {lastSaved.nodeId} · {lastSaved.summary}
          </span>
        </div>
      )}

      {err && <p className={`rounded p-2 text-sm ${t.err}`}>{err}</p>}

      {/* Live OSM delivery status + retry, available during the run too. */}
      <SyncStatus tone={tone} className="mt-auto" />
    </div>
  );
}
