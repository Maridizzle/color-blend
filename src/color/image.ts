/**
 * The pixel format the whole engine speaks.
 *
 * Deliberately plain: no DOM types, no Node types. The browser gets one of
 * these out of a canvas, the pack CLI gets one out of a decoder, and everything
 * downstream -- palette extraction, quality gating, mosaic sampling -- runs the
 * exact same code on both paths and stays testable against synthetic buffers.
 */
export interface ImageData8 {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8ClampedArray;
}

/**
 * Box-filter downscale to at most `maxDim` on the long edge.
 *
 * Palette extraction wants a few thousand representative samples, not a few
 * million; averaging into boxes (rather than dropping pixels) keeps fine
 * texture from vanishing and keeps the result stable across image resolutions,
 * which matters when packs arrive blind at wildly different sizes.
 */
export function downscale(img: ImageData8, maxDim: number): ImageData8 {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale >= 1) return img;

  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const out = new Uint8ClampedArray(w * h * 4);

  const xRatio = img.width / w;
  const yRatio = img.height / h;

  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y * yRatio);
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x * xRatio);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * xRatio));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1 && sy < img.height; sy++) {
        for (let sx = sx0; sx < sx1 && sx < img.width; sx++) {
          const i = (sy * img.width + sx) * 4;
          r += img.data[i] ?? 0;
          g += img.data[i + 1] ?? 0;
          b += img.data[i + 2] ?? 0;
          a += img.data[i + 3] ?? 0;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }

  return { width: w, height: h, data: out };
}

/**
 * Average color of an axis-aligned region, given in normalized 0..1 coords.
 * Used by the reveal to give each puzzle tile the artwork color behind it.
 * Returns null when the region is empty or fully transparent.
 */
export function averageRegion(
  img: ImageData8,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): { r: number; g: number; b: number } | null {
  const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(u0 * img.width)));
  const x1 = Math.max(x0 + 1, Math.min(img.width, Math.ceil(u1 * img.width)));
  const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(v0 * img.height)));
  const y1 = Math.max(y0 + 1, Math.min(img.height, Math.ceil(v1 * img.height)));

  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      const alpha = (img.data[i + 3] ?? 255) / 255;
      if (alpha === 0) continue;
      r += (img.data[i] ?? 0) * alpha;
      g += (img.data[i + 1] ?? 0) * alpha;
      b += (img.data[i + 2] ?? 0) * alpha;
      weight += alpha;
    }
  }
  if (weight === 0) return null;
  return { r: r / weight, g: g / weight, b: b / weight };
}
