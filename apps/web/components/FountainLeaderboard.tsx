"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";

// Ranked list of the OSM contributors who've updated the most distinct points
// through the app. Splits into two compact tables side-by-side on desktop
// (ranks 1–5 left, 6–10 right), each with its own header. Renders nothing until
// there's data — an empty leaderboard reads as broken, not "no contributors yet".
export default function FountainLeaderboard({ className = "" }: { className?: string }) {
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/leaderboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { leaders: LeaderboardEntry[] } | null) => {
        if (alive && j) setLeaders(j.leaders);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // While the fetch is in flight, show the headers with pulsing skeleton rows so
  // the section doesn't pop in.
  if (loading) {
    return (
      <div className={`flex flex-col gap-x-16 gap-y-8 sm:flex-row ${className}`}>
        {[0, 1].map((ci) => (
          <div key={ci} className="w-full sm:max-w-xs">
            <Row header rank="#" name="Contributor" points="Points" />
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Loaded, but nobody's edits have been attributed yet. Say so explicitly
  // instead of hiding the section — a blank gap reads as a bug.
  if (leaders.length === 0) {
    return (
      <p className={`text-ink-dim text-sm ${className}`}>
        No contributors yet — be the first to update a fountain.
      </p>
    );
  }

  const columns = [leaders.slice(0, 5), leaders.slice(5, 10)].filter((c) => c.length > 0);

  return (
    <div className={`flex flex-col gap-x-16 gap-y-8 sm:flex-row ${className}`}>
      {columns.map((col, ci) => (
        <div key={ci} className="w-full sm:max-w-xs">
          <Row header rank="#" name="Contributor" points="Points" />
          {col.map((l, i) => (
            <Row
              key={l.username}
              rank={String(ci * 5 + i + 1)}
              name={
                <a
                  href={`https://www.openstreetmap.org/user/${encodeURIComponent(l.username)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="decoration-ink/20 hover:decoration-ink truncate underline-offset-4 hover:underline"
                >
                  {l.username}
                </a>
              }
              points={l.points}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Placeholder body row while the leaderboard loads. Same grid as Row so widths
// match; the bars pulse to signal loading rather than a real (empty) value.
function SkeletonRow() {
  return (
    <div className="border-paper-line grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 border-b py-2.5 last:border-b-0">
      <span className="bg-ink/10 h-3 w-3 animate-pulse rounded" />
      <span className="bg-ink/10 h-3 w-28 animate-pulse rounded" />
      <span className="bg-ink/10 h-3 w-6 animate-pulse justify-self-end rounded" />
    </div>
  );
}

// One grid row shared by the header and body so the three columns line up.
function Row({
  rank,
  name,
  points,
  header = false,
}: {
  rank: string;
  name: React.ReactNode;
  points: React.ReactNode;
  header?: boolean;
}) {
  const base = "grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-3";
  if (header) {
    return (
      <div
        className={`${base} text-ink-dim border-ink/15 border-b pb-2 font-mono text-[0.65rem] font-medium tracking-[0.14em] uppercase`}
      >
        <span>{rank}</span>
        <span>{name}</span>
        <span className="text-right">{points}</span>
      </div>
    );
  }
  return (
    <div className={`${base} border-paper-line border-b py-2.5 last:border-b-0`}>
      <span className="text-ink-dim font-mono text-sm tabular-nums">{rank}</span>
      <span className="min-w-0 font-medium">{name}</span>
      <span className="text-ink-dim text-right text-sm tabular-nums">{points}</span>
    </div>
  );
}
