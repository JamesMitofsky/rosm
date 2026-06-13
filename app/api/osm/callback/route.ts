import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeToken } from "@/lib/osm";

// OAuth2 redirect target: verify state, exchange code, store token cookie.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const verifier = jar.get("osm_pkce")?.value;
  const savedState = jar.get("osm_state")?.value;

  if (!code || !state || !verifier || state !== savedState) {
    return NextResponse.redirect(`${url.origin}/?osm=error`);
  }

  try {
    const token = await exchangeToken(code, verifier, `${url.origin}/api/osm/callback`);
    const res = NextResponse.redirect(`${url.origin}/?osm=ok`);
    res.cookies.set("osm_token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    res.cookies.delete("osm_pkce");
    res.cookies.delete("osm_state");
    return res;
  } catch (e) {
    return NextResponse.redirect(`${url.origin}/?osm=error&msg=${encodeURIComponent((e as Error).message)}`);
  }
}
