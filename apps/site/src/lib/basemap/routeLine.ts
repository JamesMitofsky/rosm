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
