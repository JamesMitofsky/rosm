// Render the web/PWA raster icons from the app's SVG logo.
// The mascot SVG is transparent; these bake in the warm-paper fill so the PWA
// icons read as solid tiles. Re-run when public/icons/icon.svg changes:
//   node scripts/gen-web-icons.mjs
// (iOS marketing icon + splash live in scripts/gen-icons.mjs.)

import sharp from "sharp";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PAPER = "#f7f2e8"; // --color-paper
const svg = readFileSync(resolve(ROOT, "public/icons/icon.svg"));

// Each icon: square canvas of `size`, mascot centered at `logoHeight` px tall.
// Standard icons fill ~82% of the tile; the maskable variant sits inside the
// platform safe zone (~62%) so no limb gets clipped by a circular mask.
const targets = [
  { file: "icon-192.png", size: 192, logoHeight: 156 },
  { file: "icon-512.png", size: 512, logoHeight: 419 },
  { file: "apple-touch-icon.png", size: 180, logoHeight: 147 },
  { file: "maskable-512.png", size: 512, logoHeight: 316 },
];

for (const { file, size, logoHeight } of targets) {
  const logo = await sharp(svg, { density: 300 }).resize({ height: logoHeight }).png().toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: PAPER },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(resolve(ROOT, "public/icons", file));

  console.log(`✓ public/icons/${file}`);
}
