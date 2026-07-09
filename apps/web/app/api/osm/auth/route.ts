import { NextResponse } from "next/server";
import crypto from "crypto";
import { makePkce, authUrl, isSafeReturnTo } from "@/lib/osm";

// Start OAuth2 login: redirect to OSM authorize with PKCE.
// `?native=1` marks a Capacitor sign-in: the callback returns the token via a
// `rosm://` deep link instead of an httpOnly cookie (cookies don't reach the
// native origin). The PKCE/state hop itself still works — auth + callback both
// run on this origin inside the same in-app browser session.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const native = url.searchParams.get("native") === "1";
  const redirect = `${url.origin}/api/osm/callback`;
  const { verifier, challenge } = makePkce();
  const state = crypto.randomBytes(8).toString("hex");
  const res = NextResponse.redirect(authUrl(redirect, challenge, state));
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("osm_pkce", verifier, opts);
  res.cookies.set("osm_state", state, opts);
  if (native) res.cookies.set("osm_native", "1", opts);
  // Remember where the sign-in started so the callback can return there. Only
  // same-origin relative paths (single leading slash, not `//` or `/\`) — an
  // open-redirect guard.
  const returnTo = url.searchParams.get("returnTo");
  if (returnTo && isSafeReturnTo(returnTo)) {
    res.cookies.set("osm_return", returnTo, opts);
  }
  return res;
}
