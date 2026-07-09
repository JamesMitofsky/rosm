// Render the source iOS app-icon + splash from the app's SVG logo.
// Output feeds `@capacitor/assets generate`, which produces every required size.
// Re-run when public/icons/icon.svg changes: `node scripts/gen-icons.mjs`.

import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const INK = "#0c0d0a";
const svg = readFileSync(resolve(ROOT, "public/icons/icon.svg"));
mkdirSync(resolve(ROOT, "assets"), { recursive: true });

// 1024² opaque app icon (iOS forbids transparency in the marketing icon).
await sharp(svg)
  .resize(1024, 1024)
  .flatten({ background: INK })
  .png()
  .toFile(resolve(ROOT, "assets/icon.png"));

// 2732² splash: ink field with the logo centered (~30% width). One file serves
// both light and dark — the brand is dark either way.
const logo = await sharp(svg).resize(820, 820).png().toBuffer();
const splash = () =>
  sharp({ create: { width: 2732, height: 2732, channels: 4, background: INK } })
    .composite([{ input: logo, gravity: "center" }])
    .png();
await splash().toFile(resolve(ROOT, "assets/splash.png"));
await splash().toFile(resolve(ROOT, "assets/splash-dark.png"));

console.log("✓ wrote assets/icon.png, assets/splash.png, assets/splash-dark.png");
