/**
 * What the social card says. One module, read by both the route that renders
 * the PNG (`pages/opengraph-image.png.ts`) and the layout that describes it
 * (`og:image:alt` in `Layout.astro`), so the alt text cannot drift from the
 * picture. Kept apart from `render.ts`: that module reads fonts and the logo
 * from disk at import, which the layout has no business paying for.
 */
export const OG_SIZE = { width: 1200, height: 630 };

export type OgCopy = {
  title: string;
  /** A run of `title` set in the accent colour; must appear in it verbatim. */
  highlight?: string;
  subtitle: string;
};

export const OG_COPY: OgCopy = {
  title: "Run Verified Fountains",
  highlight: "Verified",
  subtitle: "A community-led map of public drinking fountains, checked on foot by runners.",
};

export const OG_ALT = `${OG_COPY.title} — ${OG_COPY.subtitle} Water Run.`;
