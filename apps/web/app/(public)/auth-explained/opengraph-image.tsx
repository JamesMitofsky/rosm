import { ogAlt, ogContentType, ogSize, renderOgImage } from "@/lib/og/template";

export const alt = ogAlt;
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOgImage({
    title: "How It Works",
    subtitle: "Why ROSM runs on OpenStreetMap, and how your runs fix the map.",
  });
}
