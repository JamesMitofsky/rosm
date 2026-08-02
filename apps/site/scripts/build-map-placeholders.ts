/**
 * Renders the first frame of every map on the site, once, at build time:
 *
 *   pnpm --filter @rosm/site map:placeholders
 *
 * Writes `src/lib/basemap/placeholders.generated.ts` — one base64 data URI per
 * map per breakpoint — which `MapFrame.astro` shows the instant the page paints
 * and dissolves once the live map reports its first paint.
 *
 * Why this exists: nothing else on the critical path can beat the engine. Even
 * with the style inlined and the tile host preconnected, a tile cannot be drawn
 * until ~1MB of MapLibre has been fetched *and* parsed, and on this site the
 * maps are `client:only` islands, so that download does not even begin until the
 * island's own chunk has hydrated. An image is subject to none of that — it is
 * on screen in the first paint, and the real map slides in underneath it.
 *
 * Alignment is the whole game. The image covers exactly the ground a map's
 * opening view frames, so `object-fit: cover`ing it into the frame puts a CSS
 * pixel of image over roughly the ground a CSS pixel of live map covers. Get
 * this wrong and the dissolve reads as a jump. See `frames.ts` for the geometry
 * both sides read, and re-run this after changing any of it.
 *
 * Source is CARTO's raster Voyager, the raster twin of the Voyager-derived
 * vector style the live map renders, so the two agree on palette and land/water
 * shape. Both are OpenStreetMap data; the map's own AttributionControl carries
 * the OSM credit, and the thumbnails are 160px wide, upscaled and softened, so
 * no labels survive into the page.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import sharp from "sharp";
import {
  BASEMAP_BACKGROUND,
  MAP_FRAMES,
  PLACEHOLDER_QUALITY,
  TILE_SIZE,
  placeholderSize,
  projectMercator,
  type MapFrameId,
  type MapFrameVariant,
} from "../src/lib/basemap/frames";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = resolve(siteRoot, "src/lib/basemap/placeholders.generated.ts");

/** CARTO's raster tiles are the classic 256px scheme. */
const RASTER_TILE = 256;
const RASTER_URL = (z: number, x: number, y: number) =>
  `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;

/**
 * How many zoom levels finer than strictly necessary to fetch the source tiles
 * — 4, so 16x. Buys alignment precision, not detail: the crop below is in whole
 * raster pixels, and at thumbnail scale one raster pixel at the minimum usable
 * zoom is worth tens of CSS pixels of the frame the image is stretched into, so
 * rounding the crop would throw the whole picture off by up to half of that.
 * Fetching finer tiles makes that same half-pixel worth well under one CSS
 * pixel. The extra tiles are build-time only and the pixels are thrown away in
 * the resize.
 */
const OVERSAMPLE_BITS = 4;

/**
 * How many tile requests may be in flight at once.
 *
 * The tile count grows with the square of PLACEHOLDER_WIDTH, so a frame is
 * hundreds of requests at any useful resolution. Firing them all at once does
 * not go faster — it exhausts the connection pool and CARTO starts timing out
 * the tail, which fails the whole build. Eight keeps the pipe full.
 */
const FETCH_CONCURRENCY = 8;
const FETCH_ATTEMPTS = 3;

async function fetchTile(z: number, x: number, y: number): Promise<Buffer> {
  const url = RASTER_URL(z, x, y);
  // A CDN dropping one request out of several hundred is ordinary; failing a
  // build over it is not. Backs off so a retry storm does not recreate the
  // congestion that caused the drop.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) {
      if (attempt >= FETCH_ATTEMPTS) throw error;
      await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
    }
  }
}

/** Runs `worker` over `items`, at most {@link FETCH_CONCURRENCY} at a time. */
async function mapPooled<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(FETCH_CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      await worker(items[next++]);
    }
  });
  await Promise.all(runners);
}

async function renderVariant(variant: MapFrameVariant) {
  const [lat, lon] = variant.center;
  const out = placeholderSize(variant);
  /** Scale from frame CSS pixels down to thumbnail pixels. */
  const scale = out.width / variant.frame.width;

  // The output's world is TILE_SIZE * scale * 2^zoom pixels around. The
  // smallest raster zoom whose own world covers that is where the final resize
  // stops having to upscale — written out rather than hardcoded because it moves
  // with `scale`. Then OVERSAMPLE_BITS more, for the crop precision above.
  const outputWorld = TILE_SIZE * scale * 2 ** variant.zoom;
  const rasterZoom =
    Math.ceil(variant.zoom + Math.log2((TILE_SIZE * scale) / RASTER_TILE)) + OVERSAMPLE_BITS;
  const rasterWorld = RASTER_TILE * 2 ** rasterZoom;
  const shrink = outputWorld / rasterWorld;

  // The region to cut from the raster world, in raster pixels.
  const regionW = out.width / shrink;
  const regionH = out.height / shrink;
  const [cx, cy] = projectMercator(lon, lat);
  const left = cx * rasterWorld - regionW / 2;
  const top = cy * rasterWorld - regionH / 2;

  const x0 = Math.floor(left / RASTER_TILE);
  const x1 = Math.floor((left + regionW) / RASTER_TILE);
  const y0 = Math.floor(top / RASTER_TILE);
  const y1 = Math.floor((top + regionH) / RASTER_TILE);

  const coords: { x: number; y: number }[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) coords.push({ x, y });
  }

  const tiles: { input: Buffer; left: number; top: number }[] = [];
  await mapPooled(coords, async ({ x, y }) => {
    const input = await fetchTile(rasterZoom, x, y);
    tiles.push({ input, left: (x - x0) * RASTER_TILE, top: (y - y0) * RASTER_TILE });
  });

  const mosaic = sharp({
    create: {
      width: (x1 - x0 + 1) * RASTER_TILE,
      height: (y1 - y0 + 1) * RASTER_TILE,
      channels: 3,
      background: BASEMAP_BACKGROUND,
    },
  })
    .composite(tiles)
    .png();

  const webp = await sharp(await mosaic.toBuffer())
    .extract({
      left: Math.round(left - x0 * RASTER_TILE),
      top: Math.round(top - y0 * RASTER_TILE),
      width: Math.round(regionW),
      height: Math.round(regionH),
    })
    .resize(out.width, out.height)
    .webp({ quality: PLACEHOLDER_QUALITY })
    .toBuffer();

  return {
    dataUri: `data:image/webp;base64,${webp.toString("base64")}`,
    bytes: webp.length,
    tiles: tiles.length,
    rasterZoom,
    out,
  };
}

async function main() {
  const rendered: { id: MapFrameId; media: string | null; dataUri: string }[] = [];

  for (const [id, spec] of Object.entries(MAP_FRAMES) as [
    MapFrameId,
    (typeof MAP_FRAMES)[MapFrameId],
  ][]) {
    for (const variant of spec.variants) {
      const { dataUri, bytes, tiles, rasterZoom, out } = await renderVariant(variant);
      rendered.push({ id, media: variant.media, dataUri });
      console.log(
        `${id.padEnd(20)} ${(variant.media ?? "default").padEnd(20)} ` +
          `z${variant.zoom} -> raster z${rasterZoom}, ${tiles} tiles -> ` +
          `${out.width}x${out.height} ${bytes}B (${(dataUri.length / 1024).toFixed(2)} KB inlined)`,
      );
    }
  }

  const byId = new Map<MapFrameId, { media: string | null; dataUri: string }[]>();
  for (const { id, media, dataUri } of rendered) {
    const list = byId.get(id) ?? [];
    list.push({ media, dataUri });
    byId.set(id, list);
  }

  const module = `// Generated by scripts/build-map-placeholders.ts — do not edit.
// Re-run \`pnpm --filter @rosm/site map:placeholders\` after any change to frames.ts.
import type { MapFrameId } from "./frames";

/**
 * The first frame of each map, per breakpoint, as an inline data URI.
 *
 * Inline rather than a file in \`public/\` because the whole point of this image
 * is to be on screen before anything else: a request for it competes with the
 * engine chunk it exists to cover for, and on a cold connection can lose. As a
 * data URI it arrives inside the HTML that references it, so there is no
 * request, no connection, and nothing to lose the race to.
 *
 * They are 160px-wide thumbnails, magnified into the frame, which is why that
 * is affordable — see PLACEHOLDER_WIDTH in ./frames.
 */
export const MAP_PLACEHOLDERS: Record<MapFrameId, { media: string | null; src: string }[]> = {
${[...byId]
  .map(
    ([id, list]) =>
      `  "${id}": [\n${list
        .map(
          ({ media, dataUri }) =>
            `    { media: ${media === null ? "null" : JSON.stringify(media)}, src: "${dataUri}" },`,
        )
        .join("\n")}\n  ],`,
  )
  .join("\n")}
};
`;

  // Formatted on the way out, not left to `pnpm format`. The emitted file is
  // committed, so an unformatted emit shows up as a dirty tree on whoever runs
  // the next unrelated format.
  const prettierOptions = await resolveConfig(outFile);
  writeFileSync(outFile, await format(module, { ...prettierOptions, filepath: outFile }));

  const total = rendered.reduce((n, r) => n + r.dataUri.length, 0);
  console.log(
    `\nwrote ${outFile.replace(siteRoot + "/", "")} — ${rendered.length} frames, ${(total / 1024).toFixed(1)} KB total`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
