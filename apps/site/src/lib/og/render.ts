import { readFileSync } from "node:fs";
import { join } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { OG_SIZE, type OgCopy } from "./card";

/*
 * Shared Open Graph card — an editorial-paper social card styled from the app
 * theme. Ported from the original next/og template to Satori + resvg so it can
 * be rendered at build time (prerender) into a static PNG. Since the site is a
 * single landing page, one card is emitted.
 *
 * Palette + type mirror globals.css (`@theme`) and the landing page. Restated
 * here rather than read from the stylesheet: Satori takes literal colours, and
 * a build-time parse of Tailwind's theme block for five values is more
 * machinery than five constants. Re-check these when the theme changes.
 *   surface #ffffff · base #0f0e0c · muted #5a5a5a · border #e0e0e0
 *   accent = `hero` #0b6fa7, the headline blue every display heading uses
 *   display = Space Grotesk (uppercase, tight) · body = Inter
 */

const SURFACE = "#ffffff";
const BORDER = "#e0e0e0";
const BASE = "#0f0e0c";
const MUTED = "#5a5a5a";
const ACCENT = "#0b6fa7";

// Assets are read once from disk at module load (build time) and reused.
const fontDir = join(process.cwd(), "src", "lib", "og", "fonts");
const readFont = (file: string) => readFileSync(join(fontDir, file));

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

// Transparent Water Run wordmark, embedded as a PNG data URI.
const logo = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public", "icons", "logo.png"),
).toString("base64")}`;

// Faint topographic contour field, echoing the landing hero.
const contours = (() => {
  const stroke = "%230f0e0c";
  const lines = Array.from({ length: 9 }, (_, i) => {
    const o = i * 34;
    const op = (0.1 - i * 0.009).toFixed(3);
    return `%3Cpath d='M-50 ${120 + o} C 200 ${60 + o}, 360 ${220 + o}, 560 ${180 + o} S 920 ${60 + o}, 1260 ${160 + o}' stroke='${stroke}' stroke-width='1.5' opacity='${op}' fill='none'/%3E`;
  }).join("");
  const svg = `%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='630' viewBox='0 0 1200 630'%3E${lines}%3C/svg%3E`;
  return `data:image/svg+xml,${svg}`;
})();

// The title, one entry per word, each flagged if it falls inside `highlight`
// so it can be set in the accent colour. Words rather than three runs split
// around the highlight: Satori trims the whitespace at either end of an inline
// span, so a run ending in a space met the next run with no space at all
// ("RUNVERIFIED"). Each word is its own span and the gap between them is the
// flex container's, which nothing trims.
function titleWords(title: string, highlight?: string) {
  const at = highlight ? title.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
  const end = highlight && at !== -1 ? at + highlight.length : -1;
  const words: { text: string; accent: boolean }[] = [];
  for (const match of title.matchAll(/\S+/g)) {
    const start = match.index;
    words.push({ text: match[0], accent: start >= at && start < end });
  }
  return words;
}

// Minimal hyperscript for Satori's element tree (no JSX runtime here).
type El = { type: string; props: Record<string, unknown> };
function h(type: string, style: Record<string, unknown>, children?: unknown): El {
  return { type, props: { style, children } };
}

export async function renderOgPng({ title, highlight, subtitle }: OgCopy): Promise<Buffer> {
  const words = titleWords(title, highlight);

  const children = [
    {
      type: "img",
      props: {
        src: contours,
        width: 1200,
        height: 630,
        style: { position: "absolute", top: 0, left: 0 },
      },
    },
    // Sized out explicitly: Satori does not read `inset`, and an absolutely
    // positioned box with no size renders as a 0×0 speck of border.
    h("div", {
      position: "absolute",
      top: 28,
      left: 28,
      width: OG_SIZE.width - 56,
      height: OG_SIZE.height - 56,
      border: `2px solid ${BORDER}`,
      borderRadius: 20,
    }),
    h(
      "div",
      { display: "flex", width: "100%", height: "100%", padding: 48, alignItems: "center" },
      [
        h("div", { display: "flex", flexDirection: "column", flex: 1, paddingRight: 32 }, [
          h(
            "div",
            {
              display: "flex",
              flexWrap: "wrap",
              columnGap: 22,
              fontFamily: "Space Grotesk",
              fontWeight: 700,
              fontSize: 92,
              lineHeight: 0.92,
              letterSpacing: -2,
              textTransform: "uppercase",
              color: BASE,
            },
            words.map((word) => h("span", { color: word.accent ? ACCENT : BASE }, word.text)),
          ),
          h(
            "div",
            { fontSize: 30, lineHeight: 1.35, color: MUTED, marginTop: 30, maxWidth: 620 },
            subtitle,
          ),
        ]),
        h(
          "div",
          {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 360,
            height: 360,
          },
          { type: "img", props: { src: logo, width: 360, height: 360, style: {} } },
        ),
      ],
    ),
  ];

  const tree = h(
    "div",
    {
      width: "100%",
      height: "100%",
      display: "flex",
      position: "relative",
      backgroundColor: SURFACE,
      fontFamily: "Inter",
      padding: 56,
    },
    children,
  );

  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    ...OG_SIZE,
    fonts,
  });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: OG_SIZE.width } }).render().asPng();
  return png;
}
