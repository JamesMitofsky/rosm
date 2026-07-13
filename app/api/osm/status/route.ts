import { NextResponse } from "next/server";
import { API_BASE, DRY_RUN } from "@/lib/osm";
import { getOsmToken } from "@/lib/osmToken";

// Whether the user is signed in to OSM, and which API (sandbox vs live) is targeted.
export async function GET(req: Request) {
  const token = await getOsmToken(req);
  // In dev (test env) skip the OSM connect gate so the map is reachable without OAuth.
  const loggedIn = process.env.NODE_ENV !== "production" || !!token;
  const live = API_BASE.includes("api.openstreetmap.org");
  // Dry run: signed in against live data, but writes are stubbed (nothing hits
  // the map). Surfaced so the UI can badge it.
  return NextResponse.json({ loggedIn, apiBase: API_BASE, live, dryRun: DRY_RUN });
}

// Logout.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("osm_token");
  return res;
}
