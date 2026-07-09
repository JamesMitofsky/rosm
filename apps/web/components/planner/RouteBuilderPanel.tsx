"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowsLeftRightIcon, PathIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import ErrorNotice from "@/components/ui/ErrorNotice";
import SegmentedControl from "@/components/ui/SegmentedControl";
import EditSyncPanel from "@/components/EditSyncPanel";
import type { OsmEdits } from "@/hooks/useOsmEdits";
import { usePlanner, pinnedOf, removedOf } from "@/store/planner";
import type { Fountain } from "@/lib/schemas";
import { fmtDist } from "@/lib/geo";

// Route sizing modes, shown as a segmented control on the map phase.
const SIZE_MODES = [
  { key: "distance", label: "Target distance" },
  { key: "points", label: "By waypoints" },
] as const;

function markLabel(f: Fountain) {
  return f.tags.name ?? "Unnamed fountain";
}

// Map phase: sizing controls, point picking help, plan/reverse/start-run, and
// the edit-sync review for direct OSM updates made from the map.
export default function RouteBuilderPanel({ osmEdits }: { osmEdits: OsmEdits }) {
  const p = usePlanner();

  const pinned = useMemo(
    () => pinnedOf(p),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.fountains, p.pinnedIds, p.excludedIds],
  );
  const removed = useMemo(
    () => removedOf(p),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.fountains, p.excludedIds],
  );

  // Whether the current sizing mode has enough input to plan a route.
  const sizingReady =
    p.sizeMode === "distance" ? (p.targetMi || 0) > 0 : pinned.length > 0 || p.vias.length > 0;
  const planHint = p.sizeMode === "distance" ? "Enter a target distance above." : null;

  return (
    <section className="flex w-full max-w-sm flex-col gap-4 md:max-h-[calc(100vh-7rem)] md:overflow-y-auto">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Build the route</h2>
        <button
          onClick={() => p.setPhase("config")}
          className="border-paper-line text-ink-dim hover:border-sky-deep/60 hover:text-sky-deep flex shrink-0 items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold transition"
        >
          <SlidersHorizontalIcon size={14} />
          Edit setup
        </button>
      </div>
      {p.fountains.length > 0 && (
        <span className="bg-sky/15 text-sky-deep -mt-2 w-fit rounded-full px-2 py-0.5 text-xs font-semibold">
          {p.fountains.length} found
        </span>
      )}

      {/* Route sizing: by a target distance, or by the points picked.
          Collapses away once a route exists to free vertical space. */}
      <AnimatePresence initial={false}>
        {p.stops.length === 0 && (
          <motion.div
            key="sizing"
            initial={false}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-2 overflow-hidden"
          >
            <SegmentedControl
              options={SIZE_MODES}
              value={p.sizeMode}
              onChange={p.setSizeMode}
              textSize="sm"
            />
            {p.sizeMode === "distance" && (
              <label className="flex flex-col gap-1 text-sm">
                Target run (mi)
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={p.targetMi}
                  onChange={(e) =>
                    p.setTargetMi(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="border-paper-line bg-paper/40 text-ink focus:border-sky-deep/60 rounded-lg border px-2 py-2 outline-none"
                />
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={p.loop}
                onChange={(e) => p.setLoop(e.target.checked)}
                className="accent-sky-deep h-4 w-4"
              />
              Loop (finish back at start)
            </label>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map interaction help */}
      <div className="flex flex-col gap-2">
        <p className="text-ink-dim text-xs">
          Tap to add / remove. Long-press to update in OSM. Click any space to add a waypoint
          {p.vias.length > 0 && <span className="text-ink-dim"> ({p.vias.length} added)</span>}.
        </p>
        {removed.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-ink-dim text-xs font-semibold">
              Removed from route ({removed.length})
            </span>
            <ul className="flex flex-col gap-1">
              {removed.map((f) => (
                <li
                  key={f.id}
                  className="bg-paper-deep flex items-center justify-between rounded-lg px-2 py-1 text-xs"
                >
                  <span className="text-ink-dim flex items-center gap-1 truncate line-through">
                    {markLabel(f)}
                  </span>
                  <button
                    onClick={() => p.restoreStop(f.id)}
                    className="text-sky-deep/70 hover:text-sky-deep shrink-0 font-semibold"
                    aria-label="add point back to route"
                  >
                    Add back
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {p.stops.length === 0 && (
          <motion.div
            key="plan-btn"
            initial={false}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="border-paper-line flex flex-col gap-2 overflow-hidden border-t pt-4"
          >
            <Button
              onClick={p.makeRoute}
              disabled={p.fountains.length === 0 || p.busy !== null || !sizingReady}
              className="flex items-center justify-center gap-2"
            >
              <PathIcon size={16} />
              {p.busy === "route" ? "Planning…" : "Plan route"}
            </Button>
            {p.fountains.length > 0 && !sizingReady && planHint && (
              <p className="text-ink-dim text-center text-xs">{planHint}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {p.stops.length > 0 && (
        <div className="border-sky-deep/30 bg-sky/10 rounded-2xl border p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-ink font-semibold">
              {p.stops.length} stops
              <span className="text-ink-dim ml-1 font-normal">of {p.fountains.length}</span>
            </span>
            <span className="text-sky-deep font-semibold">{fmtDist(p.distanceM)}</span>
          </div>
          {p.autoCount > 0 && (
            <p className="text-ink-dim mt-1 text-xs">
              +{p.autoCount} grabbed for a small detour off your route. Remove any you don&apos;t
              want.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {p.stops.length > 1 && (
              <Button
                onClick={p.reverseRoute}
                disabled={p.busy !== null}
                variant="accent"
                className="flex flex-1 items-center justify-center gap-2"
              >
                <ArrowsLeftRightIcon size={16} />
                {p.busy === "reverse" ? "Reversing…" : "Direction"}
              </Button>
            )}
            <button
              onClick={p.startRun}
              disabled={p.busy !== null}
              className="bg-ink text-paper hover:bg-ink-soft flex-1 rounded-sm py-2.5 font-bold transition disabled:opacity-40"
            >
              Start run →
            </button>
          </div>
        </div>
      )}

      <EditSyncPanel osmEdits={osmEdits} />

      {p.err && (
        <ErrorNotice
          message={p.err}
          onRetry={p.errRetryable ? p.findPoints : undefined}
          retrying={p.busy === "find"}
        >
          {p.islandPt && (
            <span className="text-xs text-red-300/80">
              It&apos;s marked <span className="font-bold">!</span> in red on the map. Remove that
              point (or move your nearest waypoint), then the route re-plans on its own.
            </span>
          )}
        </ErrorNotice>
      )}
    </section>
  );
}
