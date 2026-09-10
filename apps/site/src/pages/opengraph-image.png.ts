import type { APIRoute } from "astro";
import { renderOgPng } from "@/lib/og/render";

// Static social card, rendered once at build time (the logo and the basemap
// thumbnail are read from disk here, no serverless cold-start). One card for
// the whole site: every page's `Layout` points at it (see the `og:image` note
// there).
export const prerender = true;

export const GET: APIRoute = async () => {
  const png = await renderOgPng();
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
