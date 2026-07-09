import { ogAlt, ogContentType, ogSize, renderOgImage } from "@/lib/og/template";

export const alt = ogAlt;
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOgImage({
    title: "Plan Your Run",
    subtitle: "Chart a route past unverified OpenStreetMap fountains.",
  });
}
