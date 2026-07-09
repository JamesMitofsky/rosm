import { NextResponse } from "next/server";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/leaderboard";

export type { LeaderboardEntry };

// Public contributor leaderboard for the landing page. Served from a 1h cache;
// see lib/leaderboard for how the aggregate is built from OSM changesets.
export async function GET() {
  const leaders = await getLeaderboard(Date.now());
  return NextResponse.json({ leaders });
}
