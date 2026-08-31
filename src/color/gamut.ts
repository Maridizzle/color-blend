import { type Oklab, type Oklch, inSrgbGamut, oklabToOklch, oklchToOklab } from './oklab';

/**
 * Pull an out-of-gamut Oklab color back into sRGB.
 *
 * Interpolating between two in-gamut anchors can leave the sRGB cube (the cube
 * is not convex in Oklab), and naively clipping RGB channels shifts both hue and
 * lightness, which would visibly break a gradient the player is being asked to
 * sort. Instead hold L and h fixed and binary-search chroma down until the color
 * fits. Desaturating is the one change that leaves the sort order intact.
 */
export function fitToGamut(lab: Oklab, steps = 18): Oklab {
  if (inSrgbGamut(lab)) return lab;

  const { L, C, h }: Oklch = oklabToOklch(lab);

  // A zero-chroma color is in gamut whenever L is in 0..1, so clamp L first and
  // that guarantees the search below has a valid lower bound.
  const clampedL = Math.min(1, Math.max(0, L));
  if (C === 0) return oklchToOklab({ L: clampedL, C: 0, h });

  let lo = 0;
  let hi = C;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (inSrgbGamut(oklchToOklab({ L: clampedL, C: mid, h }))) lo = mid;
    else hi = mid;
  }
  return oklchToOklab({ L: clampedL, C: lo, h });
}
