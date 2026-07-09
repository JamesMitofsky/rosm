import { NextResponse } from "next/server";
import { API_BASE } from "@/lib/osm";
import { getOsmToken } from "@/lib/osmToken";

// Whether the user is signed in to OSM, and which API (sandbox vs live) is targeted.
export async function GET(req: Request) {
  const token = await getOsmToken(req);
  // In dev (test env) skip the OSM connect gate so the map is reachable without OAuth.
  const loggedIn = process.env.NODE_ENV !== "production" || !!token;
  const live = API_BASE.includes("api.openstreetmap.org");
  return NextResponse.json({ loggedIn, apiBase: API_BASE, live });
}

// Logout.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("osm_token");
  return res;
}
