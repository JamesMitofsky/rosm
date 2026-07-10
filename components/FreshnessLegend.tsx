import { lastCheckedMs } from "@/lib/checkDate";

// Freshness of a fountain's last on-the-ground verification. Never-checked folds
// into "very stale" — the point that most needs a runner to visit.
export type Bucket = "fresh" | "stale" | "very_stale";

export const BUCKET_COLOR: Record<Bucket, string> = {
  fresh: "#10b981", // emerald
  stale: "#f59e0b", // amber
  very_stale: "#f43f5e", // rose
};

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const FRESH_CUTOFF = 12 * MONTH_MS; // checked within a year
const STALE_CUTOFF = 36 * MONTH_MS; // checked within three years

// Grade a point by how long ago it was last verified. `nowMs` is passed in so
// the caller owns the clock (pure across re-renders / testable).
export function bucketOf(tags: Record<string, string>, nowMs: number): Bucket {
  const checked = lastCheckedMs(tags);
  if (checked == null) return "very_stale";
  const age = nowMs - checked;
  if (age <= FRESH_CUTOFF) return "fresh";
  if (age <= STALE_CUTOFF) return "stale";
  return "very_stale";
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  fresh: "Checked <1y ago",
  stale: "Checked 1–3y ago",
  very_stale: "Checked >3y ago",
};

const ORDER = ["fresh", "stale", "very_stale"] as const;

// Legend swatches with per-state counts (numbers kept low-emphasis).
export default function FreshnessLegend({
  counts,
  className = "",
}: {
  counts: Record<Bucket, number>;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium ${className}`}>
      {ORDER.map((b) => (
        <span key={b} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: BUCKET_COLOR[b] }}
          />
          {BUCKET_LABEL[b]}
          <span className="text-ink-dim tabular-nums">{counts[b]}</span>
        </span>
      ))}
    </div>
  );
}
