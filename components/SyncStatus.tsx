"use client";

import { useState } from "react";
import {
  CloudCheckIcon,
  CloudArrowUpIcon,
  CloudSlashIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useOutbox, outboxCounts, type OutboxItem } from "@/store/outbox";

// Review panel for the offline outbox: how many edits reached OSM, how many are
// still pending/failed, with a one-tap "retry all missed sends". Shown on the run
// completion screen and the planner's edit summary.
type Tone = "light" | "dark";

const TONE = {
  light: {
    card: "border-neutral-200 bg-white text-neutral-800",
    sub: "text-neutral-500",
    list: "border-neutral-100",
  },
  dark: {
    card: "border-paper-line bg-paper-deep/95 text-ink",
    sub: "text-ink-dim",
    list: "border-paper-line",
  },
} as const;

export default function SyncStatus({
  tone = "light",
  className = "",
}: {
  tone?: Tone;
  className?: string;
}) {
  const items = useOutbox((s) => s.items);
  const retryAll = useOutbox((s) => s.retryAll);
  const [retrying, setRetrying] = useState(false);
  const t = TONE[tone];
  const c = outboxCounts(items);

  if (c.total === 0) return null;

  async function onRetry() {
    setRetrying(true);
    try {
      await retryAll();
    } finally {
      setRetrying(false);
    }
  }

  const allSent = c.unsent === 0;
  const working = retrying || c.sending > 0;

  return (
    <div className={`flex w-full flex-col gap-3 rounded-2xl border p-4 text-left text-sm ${t.card} ${className}`}>
      <div className="flex items-center gap-2 font-semibold">
        {allSent ? (
          <>
            <CloudCheckIcon size={20} className="text-green-600" />
            All {c.sent} {c.sent === 1 ? "edit" : "edits"} sent to OSM
          </>
        ) : working ? (
          <>
            <CloudArrowUpIcon size={20} className="text-blue-500" />
            Sending to OSM…
          </>
        ) : (
          <>
            <CloudSlashIcon size={20} className="text-amber-600" />
            {c.unsent} {c.unsent === 1 ? "edit" : "edits"} not sent yet
          </>
        )}
      </div>

      {/* Count pills — number stays lower-emphasis next to each label. */}
      <div className="flex flex-wrap gap-2">
        <Pill label="Sent" count={c.sent} color="green" />
        {c.sending > 0 && <Pill label="Sending" count={c.sending} color="blue" />}
        {c.pending > 0 && <Pill label="Pending" count={c.pending} color="amber" />}
        {c.failed > 0 && <Pill label="Failed" count={c.failed} color="red" />}
      </div>

      {!allSent && (
        <button
          type="button"
          onClick={onRetry}
          disabled={working}
          className="flex items-center justify-center gap-2 rounded-full bg-ink py-2 text-sm font-semibold text-paper transition hover:bg-ink-soft disabled:opacity-50"
        >
          <ArrowsClockwiseIcon size={16} className={working ? "animate-spin" : ""} />
          {working ? "Retrying…" : "Retry all missed sends"}
        </button>
      )}

      {c.failed > 0 && (
        <ul className={`flex flex-col divide-y ${t.list} border-t ${t.list} pt-1`}>
          {items
            .filter((i) => i.syncState === "failed")
            .map((i) => (
              <FailedRow key={i.id} item={i} sub={t.sub} />
            ))}
        </ul>
      )}
    </div>
  );
}

function Pill({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "green" | "amber" | "red" | "blue";
}) {
  const dot = {
    green: "bg-green-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
  }[color];
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-current/15 px-2.5 py-1 text-xs font-medium">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
      <span className="opacity-50">{count}</span>
    </span>
  );
}

function FailedRow({ item, sub }: { item: OutboxItem; sub: string }) {
  return (
    <li className="flex items-start gap-2 py-1.5 text-xs">
      <WarningCircleIcon size={14} className="mt-0.5 shrink-0 text-red-500" />
      <span className="flex-1">
        <span className="font-medium">{item.name ?? `node ${item.nodeId}`}</span>
        <span className={sub}> · {item.summary}</span>
        {item.error && <span className="block text-red-500">{item.error}</span>}
      </span>
    </li>
  );
}

// Inline per-point sync badge for popups/banners.
export function SyncBadge({ state }: { state: OutboxItem["syncState"] }) {
  if (state === "sent")
    return (
      <span className="inline-flex items-center gap-1 text-green-700">
        <CheckCircleIcon size={13} /> sent to OSM
      </span>
    );
  if (state === "failed")
    return (
      <span className="inline-flex items-center gap-1 text-red-600">
        <WarningCircleIcon size={13} /> send failed — will retry
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-amber-600">
      <CloudArrowUpIcon size={13} /> saved · sending…
    </span>
  );
}
