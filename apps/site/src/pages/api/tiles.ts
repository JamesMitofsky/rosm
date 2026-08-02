import type { APIRoute } from "astro";

export const prerender = false;

// OpenFreeMap's TileJSON carries an `attribution` string
// ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap") that MapLibre
// auto-merges into the AttributionControl, overriding any style-level value.
// We proxy the TileJSON and drop that field so only our own OSM credit shows.
// The `tiles` URLs stay absolute to openfreemap.org, so tiles are served
// direct and the (periodically rotated) planet version stays current.
const UPSTREAM = "https://tiles.openfreemap.org/planet";

export const GET: APIRoute = async () => {
  try {
    const res = await fetch(UPSTREAM);
    if (!res.ok) {
      return Response.json({ error: { message: `upstream ${res.status}` } }, { status: 502 });
    }
    const { attribution: _drop, ...tileJson } = await res.json();
    // This document sits in front of every tile the map will ever request, so
    // the round trip through this function is on the critical path of the first
    // basemap pixel. `s-maxage` moves it off: the CDN answers from the edge and
    // the origin fetch above runs once per hour per region rather than once per
    // visitor. `stale-while-revalidate` keeps the refresh off the critical path
    // too — the hour-old copy is served instantly while the new one lands.
    //
    // Deliberately not baked into the style at build time, which would remove
    // the request entirely. OpenFreeMap's tile URLs carry a dated planet version
    // (…/planet/20260726_080001_pt/{z}/{x}/{y}.pbf) that rotates, and the
    // unversioned path answers 200 with an empty tile rather than 404 — so a
    // stale baked URL would not fail loudly, it would render a blank map. The
    // live TileJSON stays the source of truth.
    return Response.json(tileJson, {
      headers: {
        "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    return Response.json({ error: { message: (e as Error).message } }, { status: 502 });
  }
};
