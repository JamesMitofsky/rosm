import { cookies } from "next/headers";

// Resolve the OSM access token for an incoming API request.
//
// Web app: the token rides in the httpOnly `osm_token` cookie (same origin).
// Native app: there is no shared cookie across the capacitor:// origin, so the
// token is sent as an `Authorization: Bearer` header. The header wins when both
// are present.
export async function getOsmToken(req: Request): Promise<string | undefined> {
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const jar = await cookies();
  return jar.get("osm_token")?.value;
}
