"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircleIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  SnowflakeIcon,
  TrashIcon,
  WarningIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { DogIcon } from "@/components/icons/DogIcon";
import { useMapPopup } from "@/components/MapView";
import type { Fountain, EditAction, EditExtras } from "@rosm/core/schemas";
import type { StopStatus } from "@rosm/core/stores/run";
import { checkedAgoLabel } from "@rosm/core/checkDate";
import PointDetailsForm from "@/components/PointDetailsForm";
import OsmSignInLink from "@/components/OsmSignInLink";
import type { SyncState } from "@rosm/core/stores/outbox";
import { SyncBadge } from "@/components/SyncStatus";

// Local feedback for a point already updated in this session. The edit is saved
// on-device first; changesetUrl only exists once OSM accepts it.
export type PointEdit = {
  status: StopStatus;
  summary: string;
  syncState: SyncState;
  changesetUrl?: string;
  extras?: EditExtras;
};

const STATUS_LABEL: Record<string, string> = {
  confirm: "Confirmed working",
  broken: "Marked working but broken",
  out_of_order: "Marked out of order",
  removed: "Marked removed",
};

// The two actions that open the survey-details step before submitting, each
// with its own submit CTA. "Removed" is absent — it submits with no details.
const DETAIL_STEP = {
  confirm: {
    submitLabel: "Confirm working",
    submitIcon: <CheckCircleIcon size={16} weight="fill" />,
    submitClassName: "bg-green-600 hover:bg-green-700",
  },
  broken: {
    submitLabel: "Mark working but broken",
    submitIcon: <WrenchIcon size={16} />,
    submitClassName: "bg-amber-500 hover:bg-amber-600",
  },
  out_of_order: {
    submitLabel: "Mark out of order",
    submitIcon: <WarningIcon size={16} />,
    submitClassName: "bg-orange-600 hover:bg-orange-700",
  },
  removed: {
    submitLabel: "Confirm removed",
    submitIcon: <TrashIcon size={16} />,
    submitClassName: "bg-red-600 hover:bg-red-700",
  },
} as const;

// True when OSM tags already flag this point as dog water / not human-potable,
// so a future run shows the warning without re-surveying.
function isDogWater(tags: Record<string, string>): boolean {
  return tags.drinking_water === "no";
}

type Props = {
  fountain: Fountain;
  loggedIn: boolean;
  edit?: PointEdit;
  busy: boolean;
  onAction: (action: EditAction, extras?: EditExtras) => void;
  // Route-membership toggle (planner only). Omit on the run page, where points
  // are fixed and only OSM updates apply.
  inRoute?: boolean;
  onToggleRoute?: () => void;
};

// Map popup body for a found amenity point: optional route add/remove toggle +
// OSM status updates. Reused on the planner (with the toggle) and on the run
// (OSM updates only, so any point can be updated on the fly).
export default function PointPopup({
  fountain,
  loggedIn,
  edit,
  busy,
  onAction,
  inRoute,
  onToggleRoute,
}: Props) {
  const { close } = useMapPopup();
  const [detailFor, setDetailFor] = useState<
    "confirm" | "broken" | "out_of_order" | "removed" | null
  >(null);
  // Snapshot the clock once on mount — reading Date.now() during render is
  // impure; the "checked ago" label doesn't need to tick live.
  const [now] = useState(() => Date.now());

  return (
    <div className="flex w-60 flex-col gap-2.5 text-neutral-800">
      <AnimatePresence initial={false}>
        {!detailFor && (
          <motion.div
            key="header"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
              {checkedAgoLabel(fountain.tags, now)}
            </div>
            {isDogWater(fountain.tags) && (
              <div className="mt-1 flex items-center gap-1 text-xs font-medium text-violet-700">
                <DogIcon size={14} /> Dog water — not for humans
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {edit ? (
        <div className="flex flex-col gap-1 rounded bg-neutral-50 p-2 text-xs text-neutral-700">
          <div className="font-medium text-neutral-800">
            {STATUS_LABEL[edit.status] ?? "Updated"}
          </div>
          <div>{edit.summary}</div>
          {edit.extras?.seasonal && (
            <div className="flex items-center gap-1 text-sky-700">
              <SnowflakeIcon size={14} /> Seasonal
            </div>
          )}
          {edit.extras?.note && <div className="text-neutral-600 italic">“{edit.extras.note}”</div>}
          <SyncBadge state={edit.syncState} />
          {edit.changesetUrl && (
            <a
              href={edit.changesetUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-2"
            >
              view on OSM
            </a>
          )}
        </div>
      ) : (
        <>
          {onToggleRoute && (
            <button
              onClick={() => {
                onToggleRoute();
                close();
              }}
              className={`flex items-center justify-center gap-1.5 rounded border py-1.5 text-xs font-semibold transition ${
                inRoute
                  ? "border-red-400 text-red-600 hover:bg-red-50"
                  : "border-green-500 text-green-700 hover:bg-green-50"
              }`}
            >
              {inRoute ? (
                <>
                  <MinusCircleIcon size={14} /> Remove from route
                </>
              ) : (
                <>
                  <PlusCircleIcon size={14} /> Add to route
                </>
              )}
            </button>
          )}

          <div className={onToggleRoute ? "border-t border-neutral-200 pt-2" : ""}>
            {!loggedIn ? (
              <OsmSignInLink className="block rounded bg-blue-600 py-1.5 text-center text-xs font-semibold text-white">
                Sign in to OSM to update
              </OsmSignInLink>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                {!detailFor ? (
                  <motion.div
                    key="actions"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="grid grid-cols-2 gap-3"
                  >
                    <button
                      disabled={busy}
                      onClick={() => setDetailFor("out_of_order")}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-orange-300 px-1 py-3.5 text-center text-xs font-semibold text-orange-700 transition hover:bg-orange-50 disabled:opacity-50"
                    >
                      <WarningIcon size={26} weight="bold" />
                      <span>Out of order</span>
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setDetailFor("confirm")}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-md bg-green-600 px-1 py-3.5 text-center text-xs font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckCircleIcon size={26} weight="fill" />
                      <span>Working</span>
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setDetailFor("removed")}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-red-300 px-1 py-3.5 text-center text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      <TrashIcon size={26} weight="bold" />
                      <span>Removed</span>
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setDetailFor("broken")}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-md bg-amber-500 px-1 py-3.5 text-center text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-50"
                    >
                      <WrenchIcon size={26} weight="bold" />
                      <span>Working but broken</span>
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="details"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col gap-2"
                  >
                    <PointDetailsForm
                      tags={fountain.tags}
                      busy={busy}
                      submitLabel={DETAIL_STEP[detailFor].submitLabel}
                      submitIcon={DETAIL_STEP[detailFor].submitIcon}
                      submitClassName={DETAIL_STEP[detailFor].submitClassName}
                      isRemoved={detailFor === "removed"}
                      isOutOfOrder={detailFor === "out_of_order"}
                      isBroken={detailFor === "broken"}
                      onSubmit={(extras) => {
                        onAction(detailFor, extras);
                        setDetailFor(null);
                      }}
                    />
                    <button
                      onClick={() => setDetailFor(null)}
                      className="rounded border border-neutral-200 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                    >
                      Cancel
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </>
      )}
    </div>
  );
}
