import { NextResponse } from "next/server";

// OpenFreeMap's TileJSON carries an `attribution` string
// ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap") that MapLibre
// auto-merges into the AttributionControl, overriding any style-level value.
// We proxy the TileJSON and drop that field so only our own OSM credit shows.
// The `tiles` URLs stay absolute to openfreemap.org, so tiles are served
// direct and the (periodically rotated) planet version stays current.
const UPSTREAM = "https://tiles.openfreemap.org/planet";

export async function GET() {
  try {
    const res = await fetch(UPSTREAM, { next: { revalidate: 3600 } });
    if (!res.ok) {
      return NextResponse.json({ error: { message: `upstream ${res.status}` } }, { status: 502 });
    }
    const { attribution: _drop, ...tileJson } = await res.json();
    return NextResponse.json(tileJson, {
      headers: { "cache-control": "public, max-age=3600" },
    });
  } catch (e) {
    return NextResponse.json({ error: { message: (e as Error).message } }, { status: 502 });
  }
}
