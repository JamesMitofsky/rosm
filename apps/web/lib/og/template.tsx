import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/*
 * Shared Open Graph image template. Every route's `opengraph-image.tsx` re-exports
 * `ogSize` / `ogContentType` / `ogAlt` and calls `renderOgImage()` with its own copy,
 * so the whole site shares one editorial-paper social card styled from the app theme.
 *
 * Palette + type mirror `app/globals.css` (@theme) and the landing page:
 *   paper #f7f2e8 · ink #0c0d0a · ink-dim #57544a · paper-line #d6cdb6 · sky-deep #4fafd4
 *   display = Space Grotesk (uppercase, tight) · body = Inter
 */

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";
export const ogAlt = "ROSM — Running for Open-Sourced Maps";

const PAPER = "#f7f2e8";
const PAPER_LINE = "#d6cdb6";
const INK = "#0c0d0a";
const INK_DIM = "#57544a";
const SKY_DEEP = "#4fafd4";

// Assets are read once from disk at module load and reused across renders.
const assetDir = join(process.cwd(), "lib", "og", "fonts");
const readFont = (file: string) => readFileSync(join(assetDir, file));

const fonts = [
  {
    name: "Space Grotesk",
    data: readFont("SpaceGrotesk-700.ttf"),
    weight: 700 as const,
    style: "normal" as const,
  },
  {
    name: "Space Grotesk",
    data: readFont("SpaceGrotesk-500.ttf"),
    weight: 500 as const,
    style: "normal" as const,
  },
  {
    name: "Inter",
    data: readFont("Inter-600.ttf"),
    weight: 600 as const,
    style: "normal" as const,
  },
  {
    name: "Inter",
    data: readFont("Inter-400.ttf"),
    weight: 400 as const,
    style: "normal" as const,
  },
];

// Transparent running-fountain mascot (the raster icons bake in a paper fill).
// Embedded as an SVG data URI so it drops straight onto the backdrop.
const mascot = `data:image/svg+xml;base64,${readFileSync(
  join(process.cwd(), "public", "icons", "icon.svg"),
).toString("base64")}`;

// Faint topographic contour field, echoing the landing hero. Encoded as an SVG
// data URI background so Satori just paints it.
const contours = (() => {
  const stroke = "%230c0d0a";
  const lines = Array.from({ length: 9 }, (_, i) => {
    const o = i * 34;
    const op = (0.1 - i * 0.009).toFixed(3);
    return `%3Cpath d='M-50 ${120 + o} C 200 ${60 + o}, 360 ${220 + o}, 560 ${180 + o} S 920 ${60 + o}, 1260 ${160 + o}' stroke='${stroke}' stroke-width='1.5' opacity='${op}' fill='none'/%3E`;
  }).join("");
  const svg = `%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='630' viewBox='0 0 1200 630'%3E${lines}%3C/svg%3E`;
  return `data:image/svg+xml,${svg}`;
})();

export type OgCopy = {
  /** The headline, rendered uppercase in the display face. */
  title: string;
  /** Optional substring of `title` to accent in brand blue (case-insensitive). */
  highlight?: string;
  /** One-line supporting sentence. */
  subtitle: string;
};

// Split `title` around `highlight` so the matched run can be colored. Returns
// text segments tagged with whether each should be accented.
function splitTitle(title: string, highlight?: string) {
  if (!highlight) return [{ text: title, accent: false }];
  const at = title.toLowerCase().indexOf(highlight.toLowerCase());
  if (at === -1) return [{ text: title, accent: false }];
  return [
    { text: title.slice(0, at), accent: false },
    { text: title.slice(at, at + highlight.length), accent: true },
    { text: title.slice(at + highlight.length), accent: false },
  ].filter((s) => s.text.length > 0);
}

export function renderOgImage({ title, highlight, subtitle }: OgCopy) {
  const titleParts = splitTitle(title, highlight);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: PAPER,
        fontFamily: "Inter",
        padding: 56,
      }}
    >
      {/* Topographic texture */}
      <img
        src={contours}
        width={1200}
        height={630}
        style={{ position: "absolute", top: 0, left: 0 }}
      />

      {/* Editorial print-plate frame */}
      <div
        style={{
          position: "absolute",
          inset: 28,
          border: `2px solid ${PAPER_LINE}`,
          borderRadius: 20,
        }}
      />

      {/* Card body */}
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: 48,
          alignItems: "center",
        }}
      >
        {/* Left: copy */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 32 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontFamily: "Space Grotesk",
              fontWeight: 700,
              fontSize: 92,
              lineHeight: 0.92,
              letterSpacing: -2,
              textTransform: "uppercase",
              color: INK,
            }}
          >
            {titleParts.map((part, i) => (
              <span key={i} style={{ color: part.accent ? SKY_DEEP : INK }}>
                {part.text}
              </span>
            ))}
          </div>

          <div
            style={{
              fontSize: 30,
              lineHeight: 1.35,
              color: INK_DIM,
              marginTop: 30,
              maxWidth: 620,
            }}
          >
            {subtitle}
          </div>
        </div>

        {/* Right: mascot sitting bare on the backdrop */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 360,
            height: 360,
          }}
        >
          <img src={mascot} width={292} height={360} />
        </div>
      </div>
    </div>,
    { ...ogSize, fonts },
  );
}
