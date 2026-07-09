import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeToken, isSafeReturnTo } from "@/lib/osm";

// OAuth2 redirect target: verify state, exchange code, deliver the token.
//   web    → store it in an httpOnly cookie, bounce to the app.
//   native → hand it back through a `rosm://` deep link (the app stores it in the
//            native keychain and sends it as a Bearer header thereafter).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const verifier = jar.get("osm_pkce")?.value;
  const savedState = jar.get("osm_state")?.value;
  const native = jar.get("osm_native")?.value === "1";
  const returnTo = jar.get("osm_return")?.value;

  const clearTransient = (res: NextResponse) => {
    res.cookies.delete("osm_pkce");
    res.cookies.delete("osm_state");
    res.cookies.delete("osm_native");
    res.cookies.delete("osm_return");
    return res;
  };
  const fail = (msg: string) =>
    clearTransient(
      NextResponse.redirect(
        native
          ? `rosm://osm-callback?error=${encodeURIComponent(msg)}`
          : `${url.origin}/?osm=error&msg=${encodeURIComponent(msg)}`,
      ),
    );

  if (!code || !state || !verifier || state !== savedState) {
    return fail("invalid oauth state");
  }

  try {
    const token = await exchangeToken(code, verifier, `${url.origin}/api/osm/callback`);
    if (native) {
      return clearTransient(
        NextResponse.redirect(`rosm://osm-callback?token=${encodeURIComponent(token)}`),
      );
    }
    // Return to wherever sign-in started (re-validated), else home.
    const dest = new URL(returnTo && isSafeReturnTo(returnTo) ? returnTo : "/", url.origin);
    dest.searchParams.set("osm", "ok");
    const res = NextResponse.redirect(dest);
    res.cookies.set("osm_token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return clearTransient(res);
  } catch (e) {
    return fail((e as Error).message);
  }
}
