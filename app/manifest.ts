import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ROSM — Running for Open-Sourced Maps",
    short_name: "ROSM",
    description:
      "Turn your run into open-map fieldwork. Plan a route past unverified OpenStreetMap points, run it with turn-by-turn cues, and fix the map from the ground.",
    id: "/",
    start_url: "/plan",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1ebdd",
    theme_color: "#f1ebdd",
    categories: ["health", "fitness", "navigation", "sports"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Plan a route", short_name: "Plan", url: "/plan" },
      { name: "Start a run", short_name: "Run", url: "/run" },
    ],
  };
}
