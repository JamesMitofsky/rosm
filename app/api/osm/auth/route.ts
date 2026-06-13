import { NextResponse } from "next/server";
import crypto from "crypto";
import { makePkce, authUrl } from "@/lib/osm";

// Start OAuth2 login: redirect to OSM authorize with PKCE.
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const redirect = `${origin}/api/osm/callback`;
  const { verifier, challenge } = makePkce();
  const state = crypto.randomBytes(8).toString("hex");
  const res = NextResponse.redirect(authUrl(redirect, challenge, state));
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("osm_pkce", verifier, opts);
  res.cookies.set("osm_state", state, opts);
  return res;
}
