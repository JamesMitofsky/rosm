/**
 * Renders the social card to a file, so it can be looked at without a build:
 *
 *   pnpm --filter @rosm/site og:preview
 *
 * The card is a build-time artefact — `pages/opengraph-image.png.ts` is
 * prerendered — so the two other ways to see it both come with a wait or a
 * running server: `astro build` and open `dist/opengraph-image.png`, or hit
 * `/opengraph-image.png` on the dev server. This is the same `renderOgPng()`
 * both of those call, pointed at a scratch file.
 *
 * Output goes to `.og-preview.png` at the package root (git-ignored) unless a
 * path is passed. Re-run after touching `basemap.webp`, the logo, or any of
 * the constants in `render.ts`.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderOgPng } from "../src/lib/og/render";

const DEFAULT_OUT = ".og-preview.png";

// `render.ts` resolves the logo and basemap from `process.cwd()`, the same as
// it does under `astro build`, so this must be run from the package root.
const out = resolve(process.cwd(), process.argv[2] ?? DEFAULT_OUT);

const png = await renderOgPng();
writeFileSync(out, png);

console.log(`Wrote ${out} (${(png.length / 1024).toFixed(0)} KB)`);
