import type { MetadataRoute } from "next";
import { APP_NAME, APP_TAGLINE, PWA_THEME_COLOR } from "@/lib/appConfig";

// The manifest is fully static — pin it so it's emitted once at build rather than
// treated as a dynamic route. Identity is derived from lib/appConfig.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — ${APP_TAGLINE}`,
    short_name: APP_NAME,
    description:
      "Turn your run into open-map fieldwork. Plan a route past unverified OpenStreetMap points, run it with turn-by-turn cues, and fix the map from the ground.",
    id: "/",
    start_url: "/",
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
  };
}
