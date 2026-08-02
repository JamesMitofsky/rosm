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
   * Two jobs. It fixes how much *ground* the pre-rendered image covers — the
   * generator renders exactly this box at {@link zoom} — and its **ratio is the
   * frame's aspect ratio**: `MapFrame.astro` emits `aspect-ratio` from these
   * numbers, so a caller gives the frame a width and this decides its height.
   *
   * The shape has to come from here rather than from the caller because the
   * image and the map answer a change in shape differently: the thumbnail is
   * `object-fit: cover`d, so it always shows *this* view and crops whichever
   * axis has room to spare, while the map holds a fixed zoom and simply reveals
   * more ground on that axis. Any disagreement between the box and these
   * numbers shows up as the dissolve moving the map under you.
   *
   * The width is still only representative: at a wider viewport the frame is
   * the same shape but bigger, so the image scales up while the map stays at
   * {@link zoom} and shows more ground. That residual is uniform across both
   * axes, and it is seen through the frame's glass.
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
        // Square. Full-bleed in the stacked mobile layout, at a 390px phone.
        frame: { width: columnWidth(390), height: columnWidth(390) },
      },
      {
        media: null,
        center: DEMO_CENTER,
        zoom: 12,
        // Square. `md:grid-cols-[46%_1fr]` gives the map 46% of the column.
        frame: {
          width: Math.round(columnWidth(1280) * 0.46),
          height: Math.round(columnWidth(1280) * 0.46),
        },
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
        // Full-bleed on a 390px-wide phone.
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
        // Roughly 72vh of a 844px-tall phone viewport, which is what this map
        // filled before the frame's shape became its own.
        frame: { width: columnWidth(390), height: 607 },
      },
      {
        media: null,
        center: LIVE_CENTER,
        zoom: 11.3,
        // Roughly 72vh of a common 800px-tall desktop window.
        frame: { width: columnWidth(1280), height: 576 },
      },
    ],
  },
};

/**
 * Width, in pixels, of the pre-rendered frame — a thumbnail, not a picture.
 *
 * This is the frame's real blur control. The image is stretched to the width of
 * the box it fills, so the ratio between the two *is* the softening: at 96px,
 * where this started, a phone frame magnified every source pixel about 3.6x and
 * a desktop live map over 11x, which dissolved the road network entirely and
 * left only the shape of the city — river, Mall, density gradient. The `filter`
 * in `MapFrame.astro` barely registered next to it.
 *
 * At 160 the same frames magnify ~2.2x and ~7x, so arterial roads and the park
 * edges survive and the picture reads as the map it is about to become rather
 * than as fog. Raise it further to sharpen; the cost is quadratic in bytes and
 * every one of them is in the HTML.
 *
 * Small enough to inline is the constraint that bounds it. At a few kilobytes
 * each these ship as base64 data URIs inside the HTML, so the loading frame
 * costs no request at all — and a request is exactly what it could not afford,
 * since it would queue against the ~1MB engine chunk it exists to cover for.
 */
export const PLACEHOLDER_WIDTH = 160;

/** Quality the thumbnail is encoded at. Generous — a 160px image is cheap. */
export const PLACEHOLDER_QUALITY = 75;

/** The thumbnail's pixel size for a variant: {@link PLACEHOLDER_WIDTH} at the frame's aspect. */
export function placeholderSize(variant: MapFrameVariant) {
  return {
    width: PLACEHOLDER_WIDTH,
    height: Math.round((PLACEHOLDER_WIDTH * variant.frame.height) / variant.frame.width),
  };
}

/** MapLibre's vector tile size. Zoom is defined against it: world = SIZE * 2^zoom. */
export const TILE_SIZE = 512;

/**
 * Web Mercator projection into the unit square, north-west origin.
 *
 * Exported because the placeholder generator crops its raster mosaic with the
 * same projection: if the two ever disagreed the picture would be offset from
 * the map it dissolves into, which is the one failure this module exists to
 * prevent.
 */
export function projectMercator(lon: number, lat: number): [number, number] {
  return [
    (180 + lon) / 360,
    (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360,
  ];
}

/**
 * Where a point sits relative to a variant's centre, in that variant's frame
 * pixels — positive x east, positive y south.
 *
 * This is what lets the loading frame draw the real route and its stops without
 * MapLibre: the opening view is fixed at build time and the picture is centred
 * in the frame, so a point's offset from the frame's centre is knowable without
 * measuring anything and without an engine. The result is in the same
 * coordinate space as {@link MapFrameVariant.frame}, which is the space the
 * placeholder SVG's `viewBox` uses — so the overlay and the thumbnail are
 * scaled and cropped by one and the same rule.
 */
export function offsetFromCenter(
  point: { lat: number; lon: number },
  variant: MapFrameVariant,
): { x: number; y: number } {
  const world = TILE_SIZE * 2 ** variant.zoom;
  const p = projectMercator(point.lon, point.lat);
  const c = projectMercator(variant.center[1], variant.center[0]);
  return { x: (p[0] - c[0]) * world, y: (p[1] - c[1]) * world };
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
