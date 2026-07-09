import { ogAlt, ogContentType, ogSize, renderOgImage } from "@/lib/og/template";

export const alt = ogAlt;
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOgImage({
    title: "The DC Water Fountain Map",
    highlight: "Water Fountain",
    subtitle: "Map data sourced by runners",
  });
}
