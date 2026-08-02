/**
 * The fixed opening view of every map on the site, and the box it opens into.
 *
 * This module is the contract between two things that must agree exactly:
 * `scripts/build-map-placeholders.ts`, which renders a picture of that opening
 * view at build time, and `MapFrame.astro`, which paints that picture while
 * MapLibre is still downloading. If the two ever disagree about where a map
 * opens, the hand-off from picture to live map reads as a jump instead of a
 * dissolve.
 *
 * It is only possible to pre-render a frame because none of these views are
 * computed at runtime: every map on the site opens on a hard-coded centre and
 * zoom (see `DemoRunMap.svelte` and `LiveFountainMap.svelte`). A map that fitted
 * itself to data it had not fetched yet would have no knowable first frame, and
 * would have to be made static first — as the café guide in the coffee-tracker
 * repo was — before any of this could apply to it.
 */

/** Identifies one map *in one place on the site*. See {@link MapFrameSpec.frame}. */
export type MapFrameId = "demo-run" | "live-fountains-home" | "live-fountains-dc";

export type MapFrameVariant = {
  /**
   * The media query that selects this variant, or `null` for the fallback.
   *
   * Both maps pick their opening zoom off a `matchMedia` breakpoint, so a single
   * pre-rendered frame cannot cover both sides of it — at DC's live-map
   * breakpoint the two zooms are 3.5 levels apart, which is an order of
   * magnitude of ground. `MapFrame.astro` feeds these to a `<picture>`, so the
   * browser resolves the same breakpoint the component will, before any JS runs.
   *
   * Listed mobile-first: `<picture>` takes the first `<source>` that matches.
   */
  media: string | null;
  /** [lat, lon] — the exact centre the map opens on. */
  center: [number, number];
  /** The exact zoom the map opens on, for viewports this variant matches. */
  zoom: number;
  /**
   * The frame's CSS pixel size at a representative viewport of this variant.
   *
   * Not a promise about every screen — the frames are `clamp()`-sized, so their
   * real dimensions slide with the viewport. It fixes how much *ground* the
   * pre-rendered image covers, which is what makes a CSS pixel of image line up
   * with a CSS pixel of live map at the reference size, and drift gently either
   * side of it. `MapFrame.astro` `object-fit: cover`s the image, so the axis
   * that constrains stays exact and the other crops rather than letterboxing —
   * and the whole thing is seen through an 8px blur, which is why "gently" is
   * good enough here.
   */
  frame: { width: number; height: number };
};

export type MapFrameSpec = {
  /** Human note about which component and which page this frame belongs to. */
  description: string;
  variants: MapFrameVariant[];
};

/** Centre of the hero demo route — mirrors `DC_CENTER` in `lib/demoRoute.ts`. */
const DEMO_CENTER: [number, number] = [38.9068, -77.0331];
/** Centre the live fountain map opens on — mirrors `LiveFountainMap.svelte`. */
const LIVE_CENTER: [number, number] = [38.8972, -77.0369];

/**
 * Content width of a `max-w-6xl px-5` column at a given viewport width.
 *
 * `max-w-6xl` is 72rem and the site's root font size is the browser default 16,
 * so 1152px; `px-5` takes 20px off each side. Both pages that hold a map lay it
 * out inside exactly this column.
 */
const columnWidth = (viewportWidth: number) => Math.min(viewportWidth, 1152) - 40;

export const MAP_FRAMES: Record<MapFrameId, MapFrameSpec> = {
  "demo-run": {
    description: "DemoRunMap in the landing hero (index.astro)",
    variants: [
      {
        // `DemoRunMap` reads this exact query to choose its zoom.
        media: "(max-width: 767px)",
        center: DEMO_CENTER,
        zoom: 11,
        // Full-bleed in the stacked mobile layout; `h-[clamp(180px,55vw,260px)]`
        // at a 390px-wide phone lands mid-clamp at 55vw.
        frame: { width: columnWidth(390), height: 215 },
      },
      {
        media: null,
        center: DEMO_CENTER,
        zoom: 12,
        // `md:grid-cols-[46%_1fr]` gives the map 46% of the column, and
        // `md:h-[clamp(300px,40vw,460px)]` is at its 460px ceiling by 1150px wide.
        frame: { width: Math.round(columnWidth(1280) * 0.46), height: 460 },
      },
    ],
  },
  "live-fountains-home": {
    description: "LiveFountainMap in the Live Map section (index.astro)",
    variants: [
      {
        // `LiveFountainMap`'s own breakpoint — note it is *not* the same one the
        // hero uses.
        media: "(max-width: 640px)",
        center: LIVE_CENTER,
        zoom: 7.8,
        // `h-[clamp(340px,48vw,560px)]` is pinned to its 340px floor on a phone.
        frame: { width: columnWidth(390), height: 340 },
      },
      {
        media: null,
        center: LIVE_CENTER,
        zoom: 11.3,
        frame: { width: columnWidth(1280), height: 560 },
      },
    ],
  },
  "live-fountains-dc": {
    description: "LiveFountainMap on /dc-drinking-fountains",
    variants: [
      {
        media: "(max-width: 640px)",
        center: LIVE_CENTER,
        zoom: 7.8,
        // `h-[clamp(420px,72vh,760px)]` — 72vh of a 844px-tall phone viewport.
        frame: { width: columnWidth(390), height: 607 },
      },
      {
        media: null,
        center: LIVE_CENTER,
        zoom: 11.3,
        // 72vh of a common 800px-tall desktop window.
        frame: { width: columnWidth(1280), height: 576 },
      },
    ],
  },
};

/**
 * Width, in pixels, of the pre-rendered frame — a thumbnail, not a picture.
 *
 * The image is only ever seen through the frame's blur, so anything finer than
 * the blur passes is bytes spent on nothing: at this size the road network is
 * already gone and what survives is the shape of the city — the river, the Mall,
 * the density gradient — which is what the blur would have reduced a sharp image
 * to anyway.
 *
 * Small enough to inline, which is the point. At a few hundred bytes each these
 * ship as base64 data URIs inside the HTML, so the loading frame costs no
 * request at all — and a request is exactly what it could not afford, since it
 * would queue against the ~1MB engine chunk it exists to cover for.
 */
export const PLACEHOLDER_WIDTH = 96;

/** Quality the thumbnail is encoded at. Generous — 96px of anything is cheap. */
export const PLACEHOLDER_QUALITY = 75;

/** The thumbnail's pixel size for a variant: {@link PLACEHOLDER_WIDTH} at the frame's aspect. */
export function placeholderSize(variant: MapFrameVariant) {
  return {
    width: PLACEHOLDER_WIDTH,
    height: Math.round((PLACEHOLDER_WIDTH * variant.frame.height) / variant.frame.width),
  };
}

/**
 * The basemap's own background colour — `background-color` of the `background`
 * layer in `map-style.json`.
 *
 * The loading frame paints this behind the thumbnail so the first frame is never
 * the page showing through wherever the image has not decoded yet, and so that
 * what the reveal dissolves *from* is the same paper the live map draws on.
 */
export const BASEMAP_BACKGROUND = "#fbf8f3";
