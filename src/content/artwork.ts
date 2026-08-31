import type { ImageData8 } from '../color/image';
import type { Artwork, ArtworkSource } from './types';

/**
 * Artwork decoding.
 *
 * Both content paths converge here: a code-drawn sampler and a JPEG out of a
 * zip both end up as a canvas plus a plain pixel buffer, so palette extraction
 * and mosaic sampling never learn where the image came from.
 */

/** Resolution artworks are normalized to. Big enough to reveal, small enough to hold several in memory. */
export const ARTWORK_SIZE = 768;

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toImageData8(canvas: HTMLCanvasElement): ImageData8 {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: data.width, height: data.height, data: data.data };
}

/**
 * Draw an image cropped to a centered square.
 *
 * Puzzles resolve to a square no matter what shape the board was, so a portrait
 * or panorama gets center-cropped rather than letterboxed -- bars would show up
 * as a flat band in the palette and skew the whole gradient.
 */
function drawSquareCropped(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  size: number,
): void {
  const side = Math.min(sourceWidth, sourceHeight);
  const sx = (sourceWidth - side) / 2;
  const sy = (sourceHeight - side) / 2;
  ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
}

/**
 * Load a URL through an <img> rather than fetch + blob + createImageBitmap.
 *
 * Fewer moving parts, and it survives places fetch does not: an image element
 * is governed by img-src rather than connect-src, so this path keeps working
 * under a restrictive CSP and for `data:` URLs, which is what lets the whole
 * game be inlined into a single self-contained page.
 */
function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}

export async function loadArtwork(source: ArtworkSource, size = ARTWORK_SIZE): Promise<Artwork> {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');

  if (source.kind === 'drawn') {
    source.draw(ctx, size);
  } else if (source.kind === 'url') {
    const image = await loadImageElement(source.url);
    drawSquareCropped(ctx, image, image.naturalWidth, image.naturalHeight, size);
  } else {
    // Pack bytes are already in memory, so decode them directly.
    const blob = new Blob([source.bytes as BlobPart], { type: source.mime });
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch (cause) {
      throw new Error('Could not decode this image.', { cause });
    }
    drawSquareCropped(ctx, bitmap, bitmap.width, bitmap.height, size);
    bitmap.close();
  }

  return { canvas, pixels: toImageData8(canvas), width: size, height: size };
}
