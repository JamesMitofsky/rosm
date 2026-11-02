import type { APIRoute } from "astro";
import { regionBounds } from "@/lib/fountainRegions";
import { getPoints } from "@/lib/pointCache";
import { OverpassError } from "@/lib/overpass";

export const prerender = false;

// Refreshes the DC fountain cells before the day's runs, so the first volunteer
// out finds them in the cache rather than waiting on Overpass. Scheduled in
// vercel.json. It costs one Overpass query for the whole DC box, and none when
// the cells are under an hour old, which is also why a stray call costs
// nothing much.
//
// Vercel sends `Authorization: Bearer $CRON_SECRET` when the project has that
// variable set; without it, every call is refused.
const TAG = { key: "amenity", value: "drinking_water" };

export const GET: APIRoute = async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    if (!secret) console.warn("[warm-points] CRON_SECRET is not set; refusing");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const bounds = regionBounds("dc");
  if (!bounds) return Response.json({ error: "no DC region" }, { status: 500 });
  try {
    const { fountains, stale, asOf } = await getPoints({ bounds }, TAG, {
      includeDisused: true,
      signal: request.signal,
    });
    return Response.json(
      { count: fountains.length, stale, asOf: new Date(asOf).toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const message = e instanceof OverpassError ? e.message : String(e);
    console.warn("[warm-points] refresh failed:", message);
    return Response.json(
      { error: message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
};
