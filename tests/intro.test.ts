import { describe, expect, it } from 'vitest';
import { oklabToOklch, rgbToOklab } from '../src/color/oklab';
import { TONE_TUNING } from '../src/color/tones';
import { derange, titleRamp } from '../src/ui/intro';

/** Parse the #rrggbb the ramp hands out, back into a lightness. */
function lightnessOf(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return oklabToOklch(
    rgbToOklab({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }),
  ).L;
}

describe('the title card', () => {
  it('sorts to a ramp that actually runs dark to light', () => {
    // The splash is the game played once: eight tiles arrive scrambled and sort
    // themselves. If the "sorted" state is not monotonic the whole point of it
    // is lost, and nobody would notice from a static screenshot.
    const hexes = titleRamp(8);
    expect(hexes).toHaveLength(8);
    for (let i = 1; i < hexes.length; i++) {
      expect(lightnessOf(hexes[i] as string), `stop ${i}`).toBeGreaterThan(
        lightnessOf(hexes[i - 1] as string),
      );
    }
  });

  it('spans the same lightness window the boards use', () => {
    const hexes = titleRamp(8);
    expect(lightnessOf(hexes[0] as string)).toBeCloseTo(TONE_TUNING.minLightness, 2);
    expect(lightnessOf(hexes[hexes.length - 1] as string)).toBeCloseTo(
      TONE_TUNING.maxLightness,
      2,
    );
  });

  it('starts with no tile already in its final place', () => {
    // A plain shuffle leaves swatches put often enough to matter at eight
    // tiles, and a title card that opens half-sorted reads as a bug rather
    // than as a scramble.
    for (let n = 2; n <= 12; n++) {
      const sorted = Array.from({ length: n }, (_, i) => i);
      const start = derange(sorted);
      expect([...start].sort((a, b) => a - b), `n=${n}`).toEqual(sorted);
      for (let i = 0; i < n; i++) {
        expect(start[i], `n=${n}, slot ${i}`).not.toBe(sorted[i]);
      }
    }
  });
});
