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

  useEffect(() => {
    let alive = true;
    apiFetch("/api/leaderboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { leaders: LeaderboardEntry[] } | null) => {
        if (alive && j) setLeaders(j.leaders);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (leaders.length === 0) return null;

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
