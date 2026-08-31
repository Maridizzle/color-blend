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

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  return response.blob();
}

export async function loadArtwork(source: ArtworkSource, size = ARTWORK_SIZE): Promise<Artwork> {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');

  if (source.kind === 'drawn') {
    source.draw(ctx, size);
  } else {
    const blob =
      source.kind === 'bytes'
        ? new Blob([source.bytes as BlobPart], { type: source.mime })
        : await fetchBlob(source.url);

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
