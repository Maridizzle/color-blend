import type { ImageData8 } from '../src/color/image';

export function blankImage(width: number, height: number, fill = [0, 0, 0, 255]): ImageData8 {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0] ?? 0;
    data[i + 1] = fill[1] ?? 0;
    data[i + 2] = fill[2] ?? 0;
    data[i + 3] = fill[3] ?? 255;
  }
  return { width, height, data };
}

/** Image made of horizontal bands of the given colors, plus optional noise. */
export function bandedImage(
  colors: readonly (readonly [number, number, number])[],
  size = 128,
  noise = 0,
): ImageData8 {
  const img = blankImage(size, size);
  const bandHeight = size / colors.length;
  // Deterministic pseudo-noise so the test is stable run to run.
  let s = 12345;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let y = 0; y < size; y++) {
    const band = colors[Math.min(colors.length - 1, Math.floor(y / bandHeight))] as readonly [
      number,
      number,
      number,
    ];
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const jitter = noise > 0 ? (rand() - 0.5) * 2 * noise : 0;
      img.data[i] = band[0] + jitter;
      img.data[i + 1] = band[1] + jitter;
      img.data[i + 2] = band[2] + jitter;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

/** Smooth horizontal gradient between two RGB colors. */
export function gradientImage(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  size = 128,
): ImageData8 {
  const img = blankImage(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = size === 1 ? 0 : x / (size - 1);
      const i = (y * size + x) * 4;
      img.data[i] = (from[0] ?? 0) + ((to[0] ?? 0) - (from[0] ?? 0)) * t;
      img.data[i + 1] = (from[1] ?? 0) + ((to[1] ?? 0) - (from[1] ?? 0)) * t;
      img.data[i + 2] = (from[2] ?? 0) + ((to[2] ?? 0) - (from[2] ?? 0)) * t;
      img.data[i + 3] = 255;
    }
  }
  return img;
}
