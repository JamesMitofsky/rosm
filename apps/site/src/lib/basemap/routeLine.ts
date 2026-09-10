/**
 * How a route is drawn on every map here — the line `MapView.svelte` renders,
 * and the same line drawn without the engine into a loading frame
 * (`DemoRoutePlaceholder.astro`).
 *
 * A plain module, not an export of the map component: the frame is rendered
 * at build time, where importing the component would drag MapLibre into the
 * server build for three numbers.
 */
export const ROUTE_LINE = {
  color: "#2563eb",
  width: 5,
  opacity: 0.8,
  /** The part of a route still to come, under `MapView`'s `lineUpcoming`. */
  upcomingOpacity: 0.28,
} as const;

/**
 * The flag planted where a route starts — decoration, not a stop: nothing
 * to tap, no popup. Phosphor's `Flag` glyph, filled, in a green of its own.
 * `pole` is where the base of the flagpole sits in the glyph's 256-unit box,
 * as fractions of it: the point the flag is planted on, so both the live
 * marker and the loading frame shift the glyph by `pole × px` to put that
 * corner on the route's first vertex.
 */
export const START_FLAG = {
  px: 22,
  color: "#16a34a",
  pole: { x: 40 / 256, y: 224 / 256 },
} as const;
