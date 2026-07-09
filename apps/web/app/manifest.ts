import type { MetadataRoute } from "next";
import { APP_NAME, APP_TAGLINE, PWA_THEME_COLOR } from "@/lib/appConfig";

// The manifest is fully static — pin it so `output: 'export'` (Capacitor build)
// can emit it as a file instead of treating it as a dynamic route. Identity is
// derived from lib/appConfig, the single source shared with capacitor.config.ts.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — ${APP_TAGLINE}`,
    short_name: APP_NAME,
    description:
      "Turn your run into open-map fieldwork. Plan a route past unverified OpenStreetMap points, run it with turn-by-turn cues, and fix the map from the ground.",
    id: "/",
    start_url: "/mapping-portal",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: PWA_THEME_COLOR,
    theme_color: PWA_THEME_COLOR,
    categories: ["health", "fitness", "navigation", "sports"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Plan a route", short_name: "Plan", url: "/mapping-portal/plan" },
      { name: "Start a run", short_name: "Run", url: "/mapping-portal/run" },
    ],
  };
}
