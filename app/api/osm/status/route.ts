import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_BASE } from "@/lib/osm";

// Whether the user is signed in to OSM, and which API (sandbox vs live) is targeted.
export async function GET() {
  const jar = await cookies();
  const loggedIn = !!jar.get("osm_token")?.value;
  const live = API_BASE.includes("api.openstreetmap.org");
  return NextResponse.json({ loggedIn, apiBase: API_BASE, live });
}

// Logout.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("osm_token");
  return res;
}
