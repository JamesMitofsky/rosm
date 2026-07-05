"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircleIcon,
  WarningIcon,
  TrashIcon,
  ArrowUpIcon,
  SkipBackIcon,
  SkipForwardIcon,
  PlusCircleIcon,
  EyeIcon,
  DogIcon,
} from "@phosphor-icons/react";
import type { RunSession } from "@/hooks/useRunSession";
import { fmtDist, maneuver } from "@/lib/geo";
import SyncStatus from "@/components/SyncStatus";
import OsmSignInLink from "@/components/OsmSignInLink";

type Tone = "light" | "dark";

// Theme tokens so the run guidance can live both on the standalone /run page
// (light) and inline in the dark planner shell without forking the markup.
const TONE = {
  light: {
    card: "border-paper-line bg-paper-deep text-ink",
    arrow: "text-sky-deep",
    sub: "text-ink-dim",
    faint: "text-ink-dim",
    // Inspect = primary (theme accent), knockout icon. Add = secondary outline in
    // the theme blue. Skip/back muted.
    inspect: "bg-sky-deep text-paper hover:bg-sky-deep/90",
    add: "border border-sky-deep/60 text-sky-deep hover:bg-sky/30",
    skip: "border border-paper-line text-ink-dim hover:bg-paper",
    // Corner-pinned buttons need a solid backing to read over the map.
    pin: "border border-paper-line bg-paper-deep text-ink-dim hover:bg-paper",
    back: "text-ink-dim hover:text-ink",
    saved: "bg-green-50 text-green-800",
    err: "bg-red-50 text-red-700",
    signin: "bg-ink text-paper hover:bg-ink-soft",
  },
  dark: {
    card: "border-white/10 bg-ink-soft/60 text-cream",
    arrow: "text-volt",
    sub: "text-cream-dim",
    faint: "text-cream-dim/70",
    inspect: "bg-sky-deep text-paper hover:bg-sky-deep/90",
    add: "border border-sky-deep/50 text-sky-deep hover:bg-sky-deep/10",
    skip: "border border-white/15 text-cream-dim hover:bg-white/5",
    pin: "border border-white/15 bg-ink-soft text-cream-dim hover:bg-white/5",
    back: "text-cream-dim hover:text-cream",
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
    nextTurn,
    distToTurn,
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
    goBack,
    addHere,
  } = session;

  // Skip and back both jump stops, so gate each behind an inline confirm. Tracking
  // the stop index alongside the action auto-dismisses the prompt when the active
  // stop changes — no reset effect needed.
  const [confirm, setConfirm] = useState<{ i: number; action: "skip" | "back" } | null>(null);
  const pending = confirm?.i === index ? confirm.action : null;

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
            {arrived ? (
              // Inspecting: identify which stop this is rather than how to get there.
              <div className="flex flex-1 items-baseline justify-center gap-2">
                <div className="text-2xl font-medium capitalize">
                  {addLabel} #{index + 1}
                </div>
              </div>
            ) : (
              <>
                {/* Travel-relative turn arrow: 0° = straight on, + = right.
                    Falls back to "up" when no turn is ahead (final approach). */}
                <ArrowUpIcon
                  size={40}
                  weight="bold"
                  style={{ transform: `rotate(${nextTurn?.angle ?? 0}deg)` }}
                  className={`${t.arrow} transition-transform`}
                />
                <div className="flex flex-1 flex-col items-center justify-center">
                  <div className="text-2xl font-bold">
                    {(() => {
                      const d = distToTurn ?? distToTarget;
                      return d != null ? fmtDist(d) : "—";
                    })()}
                  </div>
                  <div className={`text-sm ${t.sub}`}>
                    {nextTurn ? maneuver(nextTurn.angle) : "Continue"}
                    {nextTurn?.name ? (
                      <>
                        {" onto "}
                        <span className="font-medium">{nextTurn.name}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </div>

          {target && target.tags?.drinking_water === "no" && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-violet-500">
              <DogIcon size={16} /> Dog water — not for humans
            </p>
          )}

          {!osm?.loggedIn && (
            <OsmSignInLink
              className={`rounded py-2 text-center text-sm font-semibold ${t.signin}`}
              onClick={() => setTimeout(refresh, 1000)}
            >
              Sign in to OSM to record updates
            </OsmSignInLink>
          )}

          {arrived && (
            <div className="grid gap-2">
              <button
                onClick={() => record("confirm")}
                className="flex items-center justify-center gap-2 rounded bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
              >
                <CheckCircleIcon size={20} /> Working — confirm (set check_date)
              </button>
              <button
                onClick={() => record("dog_only")}
                className="flex items-center justify-center gap-2 rounded bg-violet-600 py-3 font-semibold text-white disabled:opacity-50"
              >
                <DogIcon size={20} /> Dog water — not for humans
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

          {pending ? (
            // Inline confirmation for the stop-jumping actions (skip / back).
            <div className={`flex flex-col gap-2 rounded-lg border p-3 ${t.card}`}>
              <p className="text-sm font-medium">
                {pending === "skip"
                  ? "Skip this stop? It’ll be marked skipped and you’ll move on."
                  : "Go back to the previous stop? It’ll be re-opened for action."}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfirm(null)}
                  className={`flex items-center justify-center rounded py-2.5 text-sm font-semibold ${t.skip}`}
                >
                  Cancel
                </button>
                {pending === "skip" ? (
                  <button
                    onClick={() => {
                      setConfirm(null);
                      skip();
                    }}
                    className="flex items-center justify-center gap-1.5 rounded bg-amber-500 py-2.5 text-sm font-semibold text-white"
                  >
                    <SkipForwardIcon size={18} /> Skip stop
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setConfirm(null);
                      goBack();
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded py-2.5 text-sm font-semibold ${t.inspect}`}
                  >
                    <SkipBackIcon size={18} /> Go back
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Primary actions: add + inspect, solid. Hidden once the inspect
                  (arrival) menu is open, since both are redundant there. */}
              {!arrived && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    title={`Add ${addLabel} here${added.length > 0 ? ` · ${added.length} added` : ""}`}
                    disabled={!osm?.loggedIn || adding || !session.userPos}
                    onClick={addHere}
                    className={`flex items-center justify-center rounded py-3 disabled:opacity-50 ${t.add}`}
                  >
                    <PlusCircleIcon size={22} weight="bold" />
                  </button>
                  <button
                    title="I'm here — inspect"
                    onClick={() => setManualArrived(true)}
                    className={`flex items-center justify-center rounded py-3 ${t.inspect}`}
                  >
                    <EyeIcon size={22} weight="bold" />
                  </button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Secondary nav (back + skip), pinned to the screen's bottom-right corner.
          Kept outside the animated/transformed block so `fixed` anchors to the
          viewport. Hidden while a confirm dialog is up. */}
      {!pending && (
        <div className="fixed right-4 bottom-4 z-50 flex gap-2">
          {index > 0 && (
            <button
              title="Back to previous stop"
              onClick={() => setConfirm({ i: index, action: "back" })}
              className={`flex items-center justify-center rounded px-3 py-2 shadow-sm ${t.pin}`}
            >
              <SkipBackIcon size={18} />
            </button>
          )}
          <button
            title="Skip this stop"
            onClick={() => setConfirm({ i: index, action: "skip" })}
            className={`flex items-center justify-center rounded px-3 py-2 shadow-sm ${t.pin}`}
          >
            <SkipForwardIcon size={18} />
          </button>
        </div>
      )}

      {lastSaved && (
        <div className={`flex items-center gap-2 rounded p-2 text-sm ${t.saved}`}>
          <CheckCircleIcon size={18} className="shrink-0" />
          <span className="flex-1 text-left">
            Saved · {lastSaved.summary}
          </span>
        </div>
      )}

      {err && <p className={`rounded p-2 text-sm ${t.err}`}>{err}</p>}

      {/* Live OSM delivery status + retry, available during the run too. */}
      <SyncStatus tone={tone} className="mt-auto" />
    </div>
  );
}
