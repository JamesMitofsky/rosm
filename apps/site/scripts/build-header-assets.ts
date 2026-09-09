/**
 * Derives the two images the site header inlines, once, at build-author time:
 *
 *   pnpm --filter @rosm/site header:assets
 *
 * - `src/assets/logo-120.png`: the brand mark at 3x its 40px render, from
 *   `public/icons/logo.png` (the full-size master the OG card also uses).
 *   Layout.astro imports it with Vite's `?inline` and sets it as a data URI.
 * - `src/assets/nav-active-mask.webp`: the nav's "current page" chalk splotch
 *   as an alpha-only mask, from `src/assets/nav-active-bg.png` (the painted
 *   source, one flat blue over a textured alpha). `globals.css` applies it with
 *   `mask-image` and paints the blue back in with `background-color`.
 * - `src/assets/hero-handwriting-mask.webp`: the index page's handwritten
 *   headline, same treatment, from `src/assets/hero-handwriting.png`.
 *   `index.astro` inlines it into the `<h1>` and fills it with a colour token.
 *   Its pixel size goes to `hero-handwriting-mask.generated.ts` alongside, for
 *   the box's `aspect-ratio`: importing the WebP itself for its metadata
 *   makes the image pipeline emit a copy of it that nothing requests.
 *
 * Why inline, and why this small: the header is on every page, and every page
 * is a fresh document (no client router), so each navigation paints from
 * scratch. An image the page has to *request* — even one the browser has
 * cached, since files under `public/` ship with `max-age=0, must-revalidate`
 * and are re-checked on every load — lands a beat after first paint and pops
 * in. A data URI arrives inside the HTML or CSS that references it, so it is
 * on screen in the same frame as the text beside it. That is only affordable
 * if the bytes stay small, which is what the format choices below are for.
 *
 * Why a mask beats a picture for the two blue images: each is one flat colour
 * over a textured alpha, so the alpha is the only information. WebP compresses
 * a lossy alpha channel badly, but the same texture as luminance is a fraction
 * of the bytes (the headline: ~28 KB at 1280px, against 31–277 KB for the
 * five responsive WebPs the image pipeline used to emit). One file then serves
 * every breakpoint, and the colour becomes a CSS token rather than baked pixels.
 *
 * Re-run after replacing any source. All emitted files are committed.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import sharp, { type OutputInfo } from "sharp";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const asset = (name: string) => resolve(siteRoot, "src/assets", name);

/**
 * Logo: rendered at 40 CSS px, so 120 is 3x — crisp on any phone. Flat
 * artwork with few colours, which is why it goes out as a palette PNG: as a
 * WebP the same pixels are three to four times the bytes, lossless or not.
 * 64 entries is above the mark's actual colour count; the quantiser only
 * uses what it needs.
 */
const LOGO_WIDTH = 120;
const LOGO_COLORS = 64;

/**
 * Mask: stretched (`mask-size: 100% 100%`) over a nav item of roughly
 * 130 x 36 CSS px, so 320 wide covers a 2x display with headroom and is still
 * soft-edged chalk at 3x — the texture has no fine detail to lose. WebP
 * compresses a lossy alpha channel badly (a 300px cut of the full image is
 * ~13 KB) but the same texture as luminance is ~4 KB, and lossy is fine here:
 * chalk grain is noise, and banding in a mask reads as more chalk.
 */
const MASK_WIDTH = 320;
const MASK_QUALITY = 70;

/**
 * Headline: renders at most 36rem (576 CSS px) wide, so 1280 is over 2x and
 * still generous at 3x; the strokes are soft-edged ink with nothing finer to
 * keep. Lossy grain reads as more ink, as with the splotch.
 */
const HERO_WIDTH = 1280;
const HERO_QUALITY = 70;

function report(outFile: string, out: OutputInfo) {
  console.log(
    `wrote ${outFile.replace(siteRoot + "/", "")} — ${out.width}x${out.height}, ${(out.size / 1024).toFixed(1)} KB`,
  );
}

async function buildLogo() {
  const outFile = asset("logo-120.png");
  const out = await sharp(resolve(siteRoot, "public/icons/logo.png"))
    .resize({ width: LOGO_WIDTH })
    .png({ palette: true, colors: LOGO_COLORS, compressionLevel: 9 })
    .toFile(outFile);
  report(outFile, out);
}

/** Alpha channel only, as a grayscale WebP: white where the source is opaque. */
async function buildAlphaMask(source: string, outName: string, width: number, quality: number) {
  const outFile = asset(outName);
  const out = await sharp(asset(source))
    .resize({ width })
    // Channel 3 is alpha; on its own it becomes a single-channel grayscale image.
    .extractChannel(3)
    .webp({ quality })
    .toFile(outFile);
  report(outFile, out);
  return out;
}

async function buildHeroMask() {
  const out = await buildAlphaMask(
    "hero-handwriting.png",
    "hero-handwriting-mask.webp",
    HERO_WIDTH,
    HERO_QUALITY,
  );
  const outFile = asset("hero-handwriting-mask.generated.ts");
  const module = `// Generated by scripts/build-header-assets.ts — do not edit.
/** Pixel size of hero-handwriting-mask.webp, for the headline box's aspect ratio. */
export const HERO_MASK_SIZE = { width: ${out.width}, height: ${out.height} } as const;
`;
  // Formatted on the way out: the emitted file is committed, so an unformatted
  // emit shows up as a dirty tree on whoever runs the next unrelated format.
  const prettierOptions = await resolveConfig(outFile);
  writeFileSync(outFile, await format(module, { ...prettierOptions, filepath: outFile }));
  console.log(`wrote ${outFile.replace(siteRoot + "/", "")}`);
}

void Promise.all([
  buildLogo(),
  buildAlphaMask("nav-active-bg.png", "nav-active-mask.webp", MASK_WIDTH, MASK_QUALITY),
  buildHeroMask(),
]).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
