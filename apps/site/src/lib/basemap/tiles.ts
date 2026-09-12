/**
 * OpenFreeMap's TileJSON for the planet vector tiles every map on the site
 * draws from.
 *
 * One constant for its two readers, which must never disagree: `/api/tiles`
 * proxies it to the live maps, and `scripts/build-map-placeholders.ts` points
 * the same style at it directly to render each map's loading frame. A frame
 * rendered from different tiles than the map it dissolves into would show
 * different ground under the dissolve.
 */
export const OPENFREEMAP_TILEJSON = "https://tiles.openfreemap.org/planet";
