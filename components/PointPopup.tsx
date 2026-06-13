"use client";

import {
  CheckCircleIcon,
  WarningIcon,
  TrashIcon,
  PushPinIcon,
  PushPinSlashIcon,
} from "@phosphor-icons/react";
import type { Fountain, EditAction } from "@/lib/schemas";
import type { StopStatus } from "@/store/run";

// Local feedback for a point already updated in this session.
export type PointEdit = {
  status: StopStatus;
  summary: string;
  changesetUrl: string;
};

const STATUS_LABEL: Partial<Record<StopStatus, string>> = {
  confirm: "Confirmed working",
  out_of_order: "Marked out of order",
  removed: "Marked removed",
  delete: "Deleted from OSM",
};

type Props = {
  fountain: Fountain;
  loggedIn: boolean;
  isPinned: boolean;
  edit?: PointEdit;
  busy: boolean;
  onPin: () => void;
  onAction: (action: EditAction) => void;
};

// Map popup body for a found amenity point: pin toggle + OSM status updates,
// usable from the planner without starting a run.
export default function PointPopup({
  fountain,
  loggedIn,
  isPinned,
  edit,
  busy,
  onPin,
  onAction,
}: Props) {
  const name = fountain.tags.name ?? `node ${fountain.id}`;
  const deleted = edit?.status === "delete";

  return (
    <div className="flex w-56 flex-col gap-2 text-neutral-800">
      <div>
        <div className="font-semibold leading-tight">{name}</div>
        {fountain.tags.check_date && (
          <div className="text-xs text-neutral-500">
            Last checked in OSM: {fountain.tags.check_date}
          </div>
        )}
      </div>

      {edit ? (
        <div className="rounded bg-green-50 p-2 text-xs text-green-800">
          <div className="font-medium">{STATUS_LABEL[edit.status] ?? "Updated"}</div>
          <div className="text-green-700">{edit.summary}</div>
          <a
            href={edit.changesetUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-2"
          >
            view on OSM
          </a>
        </div>
      ) : (
        <>
          <button
            onClick={onPin}
            className="flex items-center justify-center gap-1.5 rounded border border-amber-500 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
          >
            {isPinned ? (
              <>
                <PushPinSlashIcon size={14} /> Unpin from route
              </>
            ) : (
              <>
                <PushPinIcon size={14} /> Pin as required stop
              </>
            )}
          </button>

          <div className="border-t border-neutral-200 pt-2">
            {!loggedIn ? (
              <a
                href="/api/osm/auth"
                className="block rounded bg-blue-600 py-1.5 text-center text-xs font-semibold text-white"
              >
                Sign in to OSM to update
              </a>
            ) : (
              <div className="flex flex-col gap-1.5">
                <button
                  disabled={busy}
                  onClick={() => onAction("confirm")}
                  className="flex items-center justify-center gap-1.5 rounded bg-green-600 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <CheckCircleIcon size={16} /> Working — confirm
                </button>
                <button
                  disabled={busy}
                  onClick={() => onAction("out_of_order")}
                  className="flex items-center justify-center gap-1.5 rounded bg-amber-500 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <WarningIcon size={16} /> Out of order
                </button>
                <button
                  disabled={busy}
                  onClick={() => onAction("removed")}
                  className="flex items-center justify-center gap-1.5 rounded bg-red-600 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <TrashIcon size={16} /> Removed
                </button>
                <details className="text-xs">
                  <summary className="cursor-pointer text-neutral-500">Advanced</summary>
                  <button
                    disabled={busy || deleted}
                    onClick={() => onAction("delete")}
                    className="mt-1.5 w-full rounded border border-red-600 py-1.5 text-xs font-medium text-red-600 disabled:opacity-50"
                  >
                    Delete node from OSM (irreversible)
                  </button>
                </details>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
