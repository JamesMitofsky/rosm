import { describe, expect, it } from "vitest";
import rawMapStyle from "@/lib/basemap/map-style.json";
import { PLACE_DOT_ID, placeDotImage } from "@/lib/basemap/placeDot";

// MapLibre's SDF edge, 192/256 of the alpha range. Inside the shape is above
// it, outside below.
const EDGE = 0.75 * 255;

describe("placeDotImage", () => {
  const image = placeDotImage();
  const alphaAt = (x: number, y: number) => image.data[(y * image.width + x) * 4 + 3]!;

  it("is a 15px box of RGBA pixels", () => {
    expect(image.width).toBe(15);
    expect(image.height).toBe(15);
    expect(image.data.length).toBe(15 * 15 * 4);
  });

  it("is inside the edge at the centre and outside it at the corners", () => {
    expect(alphaAt(7, 7)).toBeGreaterThan(EDGE);
    for (const [x, y] of [
      [0, 0],
      [14, 0],
      [0, 14],
      [14, 14],
    ] as const) {
      expect(alphaAt(x, y)).toBeLessThan(EDGE);
    }
  });

  it("puts the edge 4.5px from the centre, the 9px disc it was drawn for", () => {
    // Pixel 3's centre is 7.5 - 3.5 = 4px from the box's centre: 0.5px in.
    // Pixel 2's is 5px out: 0.5px outside. Half a pixel is 1/16 of the range.
    expect(alphaAt(3, 7)).toBe(Math.round(EDGE + 255 / 16));
    expect(alphaAt(2, 7)).toBe(Math.round(EDGE - 255 / 16));
  });

  it("is symmetric about the centre", () => {
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        expect(alphaAt(x, y)).toBe(alphaAt(14 - x, y));
        expect(alphaAt(x, y)).toBe(alphaAt(y, x));
      }
    }
  });
});

describe("map-style.json icons", () => {
  type Layer = { id: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> };
  const layers = (rawMapStyle as { layers: Layer[] }).layers;

  it("only tints the dot this code draws", () => {
    // `icon-color` works on SDF images only, and OpenFreeMap's sprite has
    // none, so a tinted icon that is not ours would draw in its baked colour.
    const tinted = layers.filter((layer) => layer.paint?.["icon-color"] !== undefined);
    const withIcon = tinted.filter((layer) => layer.layout?.["icon-image"]);
    expect(withIcon.length).toBeGreaterThan(0);
    for (const layer of withIcon) {
      expect({ id: layer.id, icon: layer.layout?.["icon-image"] }).toEqual({
        id: layer.id,
        icon: PLACE_DOT_ID,
      });
    }
  });
});
