// @ts-check
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";

// Server output (API endpoints under src/pages/api). Static pages are still
// prerendered by default; only routes/endpoints that opt out run on-demand.
export default defineConfig({
  output: "server",
  adapter: vercel(),
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
    // Without a stated floor the release minifier reads a prefixed property
    // and its standard twin as one declaration and keeps only the last —
    // which silently dropped `backdrop-filter` from the map frames' frosted
    // glass in every build, so Firefox rendered them unblurred. Given targets
    // it keeps both, and adds prefixes the floor needs but the source omits.
    // Safari 15 is the floor because the iOS app ships through Capacitor.
    build: {
      cssTarget: ["chrome110", "firefox115", "safari15", "edge110"],
    },
  },
});
