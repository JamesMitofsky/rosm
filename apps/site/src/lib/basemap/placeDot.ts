/**
 * The dot that marks a city beside its label at low zooms (the
 * `place_*_dot_*` layers in `map-style.json`), drawn here instead of taken
 * from the sprite.
 *
 * The style came from CARTO's Voyager, whose own sprite has an icon called
 * `circle-11`. The sprite we load is OpenFreeMap's, which has no image by that
 * name. Its nearest match, `circle_11`, is a plain bitmap filled in Liberty's
 * brown, and OpenFreeMap's sprite has no SDF images at all. Only an SDF image
 * takes its colour from the layer's `icon-color`, so pointing the layers at
 * `circle_11` would draw brown dots beside slate labels. MapLibre skipped the
 * missing icon, drew the label without it, and logged a warning.
 *
 * So the map supplies the image itself. `MapView` adds it from the map's
 * `styleimagemissing` event, which MapLibre fires before it gives up on an
 * image and then reads the image back straight away, so an image added inside
 * the listener is the one the tile uses.
 *
 * The id is ours rather than CARTO's, so the style does not look as if it
 * expects the sprite to provide it.
 */
export const PLACE_DOT_ID = "place-dot";

/**
 * The geometry of Maki's 11px circle, the icon the style was drawn around: a
 * 9px disc centred in a 15px box (OpenFreeMap's `circle_11.svg` is the same
 * shape). Keeping that geometry means the layers' `icon-size: 0.4` and
 * `icon-offset: [16, 5]`, which were tuned against it, still put the dot where
 * the label expects it.
 */
const BOX_PX = 15;
const RADIUS_PX = 4.5;

/**
 * MapLibre's SDF encoding, from its `symbol_sdf` fragment shader: the alpha
 * channel holds distance from the shape's edge, the edge itself sits at
 * 192/256 (0.75), and one pixel of distance is 1/8 of the range (`SDF_PX`).
 * That is tiny-sdf's output with radius 8 and cutoff 0.25, the generator
 * MapLibre uses for its own glyphs.
 */
const SDF_EDGE = 0.75;
const SDF_PX = 8;

/**
 * The dot as an SDF image, ready for `map.addImage(PLACE_DOT_ID, image, { sdf: true })`.
 *
 * Distances are measured from each pixel's centre to the disc's edge. Only
 * alpha is read for an SDF image; the colour channels are left at zero.
 */
export function placeDotImage(): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(BOX_PX * BOX_PX * 4);
  const centre = BOX_PX / 2;
  for (let y = 0; y < BOX_PX; y++) {
    for (let x = 0; x < BOX_PX; x++) {
      // Positive outside the disc, negative inside.
      const distance = Math.hypot(x + 0.5 - centre, y + 0.5 - centre) - RADIUS_PX;
      // The clamped array rounds and clamps to 0..255.
      data[(y * BOX_PX + x) * 4 + 3] = (SDF_EDGE - distance / SDF_PX) * 255;
    }
  }
  return { width: BOX_PX, height: BOX_PX, data };
}
