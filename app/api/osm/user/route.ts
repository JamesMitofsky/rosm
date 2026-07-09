import { NextResponse, after } from "next/server";
import { API_BASE } from "@/lib/osm";
import { getOsmToken } from "@/lib/osmToken";
import { registerUser } from "@/lib/leaderboard";

// The signed-in user's OSM identity, trimmed to what the UI needs. Kept separate
// from /api/osm/status (polled everywhere) so a status check never costs an OSM
// API roundtrip.
export async function GET(req: Request) {
  const token = await getOsmToken(req);
  if (!token) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const r = await fetch(`${API_BASE}/api/0.6/user/details.json`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    return NextResponse.json({ error: "couldn't load OSM user" }, { status: r.status });
  }
  const j = await r.json();
  const u = j.user ?? {};
  // Self-populate the contributor leaderboard: refresh this user's tally after
  // the response ships, so they surface on the board without waiting on it here.
  if (u.display_name) {
    const name = u.display_name as string;
    after(() => registerUser(name).catch(() => {}));
  }
  return NextResponse.json({
    id: u.id ?? null,
    username: u.display_name ?? null,
    avatarUrl: u.img?.href ?? null,
    changesetCount: u.changesets?.count ?? 0,
    accountCreated: u.account_created ?? null,
  });
}
