import { describe, expect, it } from 'vitest';
import {
  deltaE,
  inSrgbGamut,
  mix,
  oklabToOklch,
  oklabToRgb,
  oklchToOklab,
  rgbToOklab,
} from '../src/color/oklab';
import { fitToGamut } from '../src/color/gamut';
import { averageRegion, downscale } from '../src/color/image';
import { mergeClusters, quantize } from '../src/color/quantize';
import { extractPalette, selectAnchors } from '../src/color/palette';
import { bandedImage, blankImage, gradientImage } from './helpers';

describe('oklab', () => {
  it('round-trips sRGB across a color grid', () => {
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const back = oklabToRgb(rgbToOklab({ r, g, b }));
          expect(Math.abs(back.r - r)).toBeLessThanOrEqual(1);
          expect(Math.abs(back.g - g)).toBeLessThanOrEqual(1);
          expect(Math.abs(back.b - b)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('round-trips through OKLCH', () => {
    const lab = rgbToOklab({ r: 200, g: 90, b: 40 });
    const back = oklchToOklab(oklabToOklch(lab));
    expect(deltaE(lab, back)).toBeLessThan(1e-9);
  });

  it('orders lightness the way a viewer would', () => {
    const black = rgbToOklab({ r: 0, g: 0, b: 0 });
    const mid = rgbToOklab({ r: 128, g: 128, b: 128 });
    const white = rgbToOklab({ r: 255, g: 255, b: 255 });
    expect(black.L).toBeLessThan(mid.L);
    expect(mid.L).toBeLessThan(white.L);
    // Perceptual middle gray should land near the middle of the L range, which
    // is exactly what sRGB's own 0.5 fails to do.
    expect(mid.L).toBeGreaterThan(0.4);
    expect(mid.L).toBeLessThan(0.7);
  });

  it('has a symmetric distance that is zero on itself', () => {
    const x = rgbToOklab({ r: 10, g: 200, b: 90 });
    const y = rgbToOklab({ r: 240, g: 30, b: 120 });
    expect(deltaE(x, x)).toBe(0);
    expect(deltaE(x, y)).toBeCloseTo(deltaE(y, x), 12);
    expect(deltaE(x, y)).toBeGreaterThan(0.1);
  });

  it('mixes to the endpoints and to a true midpoint', () => {
    const x = rgbToOklab({ r: 0, g: 0, b: 0 });
    const y = rgbToOklab({ r: 255, g: 255, b: 255 });
    expect(deltaE(mix(x, y, 0), x)).toBeLessThan(1e-12);
    expect(deltaE(mix(x, y, 1), y)).toBeLessThan(1e-12);
    const half = mix(x, y, 0.5);
    expect(Math.abs(deltaE(half, x) - deltaE(half, y))).toBeLessThan(1e-9);
  });
});

describe('gamut fitting', () => {
  it('pulls an out-of-gamut color into sRGB', () => {
    const wild = { L: 0.7, a: 0.4, b: 0.2 };
    expect(inSrgbGamut(wild)).toBe(false);
    const fitted = fitToGamut(wild);
    expect(inSrgbGamut(fitted)).toBe(true);
  });

  it('preserves lightness and hue while reducing chroma', () => {
    const wild = { L: 0.6, a: 0.35, b: -0.25 };
    const fitted = fitToGamut(wild);
    const before = oklabToOklch(wild);
    const after = oklabToOklch(fitted);
    expect(after.L).toBeCloseTo(before.L, 6);
    expect(after.h).toBeCloseTo(before.h, 4);
    expect(after.C).toBeLessThan(before.C);
  });

  it('leaves in-gamut colors untouched', () => {
    const fine = rgbToOklab({ r: 120, g: 80, b: 200 });
    expect(fitToGamut(fine)).toEqual(fine);
  });
});

describe('image utilities', () => {
  it('downscales to the requested long edge', () => {
    const small = downscale(blankImage(400, 200), 100);
    expect(small.width).toBe(100);
    expect(small.height).toBe(50);
  });

  it('leaves an already-small image alone', () => {
    const img = blankImage(40, 30);
    expect(downscale(img, 100)).toBe(img);
  });

  it('averages a region and ignores transparent pixels', () => {
    const img = bandedImage(
      [
        [255, 0, 0],
        [0, 0, 255],
      ],
      64,
    );
    const top = averageRegion(img, 0, 0, 1, 0.4);
    expect(top?.r).toBeGreaterThan(240);
    expect(top?.b).toBeLessThan(15);

    const clear = blankImage(16, 16, [10, 20, 30, 0]);
    expect(averageRegion(clear, 0, 0, 1, 1)).toBeNull();
  });
});

describe('quantize', () => {
  it('recovers planted colors from a noisy image', () => {
    const planted: [number, number, number][] = [
      [220, 40, 40],
      [40, 180, 90],
      [50, 70, 210],
    ];
    const clusters = mergeClusters(quantize(bandedImage(planted, 128, 6)), 0.09);
    expect(clusters.length).toBe(3);

    // Each planted color should have a cluster sitting essentially on top of it.
    for (const rgb of planted) {
      const target = rgbToOklab({ r: rgb[0], g: rgb[1], b: rgb[2] });
      const nearest = Math.min(...clusters.map((c) => deltaE(c.color, target)));
      expect(nearest).toBeLessThan(0.05);
    }

    const totalWeight = clusters.reduce((s, c) => s + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 6);
  });

  it('collapses to a single cluster on a solid image', () => {
    const clusters = mergeClusters(quantize(blankImage(64, 64, [77, 88, 99, 255])), 0.09);
    expect(clusters.length).toBe(1);
  });

  it('is deterministic for a given seed', () => {
    const img = bandedImage(
      [
        [200, 30, 30],
        [30, 30, 200],
      ],
      96,
      10,
    );
    const a = quantize(img, { seed: 7 });
    const b = quantize(img, { seed: 7 });
    expect(a.map((c) => c.color)).toEqual(b.map((c) => c.color));
  });

  it('returns nothing for a fully transparent image', () => {
    expect(quantize(blankImage(32, 32, [10, 10, 10, 0]))).toEqual([]);
  });
});

describe('anchor selection', () => {
  it('returns anchors sorted dark to light spanning the range', () => {
    const clusters = mergeClusters(
      quantize(
        bandedImage(
          [
            [15, 15, 30],
            [90, 40, 120],
            [230, 200, 120],
          ],
          128,
        ),
      ),
      0.09,
    );
    const anchors = selectAnchors(clusters, 4);
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i]!.L).toBeGreaterThanOrEqual(anchors[i - 1]!.L);
    }
    // Darkest and lightest substantial shades must both be present -- that pair
    // is what the board's dark-to-light axis is built from.
    expect(anchors[0]!.L).toBeLessThan(0.35);
    expect(anchors[anchors.length - 1]!.L).toBeGreaterThan(0.7);
  });

  it('never returns more anchors than requested', () => {
    const clusters = mergeClusters(
      quantize(
        bandedImage(
          [
            [10, 10, 10],
            [80, 20, 20],
            [20, 80, 20],
            [20, 20, 80],
            [200, 200, 60],
            [240, 240, 240],
          ],
          128,
        ),
      ),
      0.09,
    );
    expect(selectAnchors(clusters, 3).length).toBe(3);
  });
});

describe('quality gate', () => {
  it('accepts a varied image', () => {
    const palette = extractPalette(
      bandedImage(
        [
          [20, 25, 60],
          [40, 120, 160],
          [235, 210, 150],
        ],
        160,
      ),
    );
    expect(palette.verdict).toBe('ok');
    expect(palette.issues).toEqual([]);
    expect(palette.anchors.length).toBeGreaterThanOrEqual(2);
    expect(palette.spread).toBeGreaterThan(0.28);
  });

  it('rejects a flat gray image', () => {
    const palette = extractPalette(blankImage(128, 128, [128, 128, 128, 255]));
    expect(palette.verdict).toBe('reject');
    expect(palette.issues.map((i) => i.code)).toContain('too-few-shades');
  });

  it('rejects a near-uniform image as flat', () => {
    const palette = extractPalette(
      bandedImage(
        [
          [128, 128, 128],
          [132, 131, 130],
        ],
        128,
      ),
    );
    expect(palette.verdict).toBe('reject');
  });

  it('rejects an image too small to build a mosaic from', () => {
    const palette = extractPalette(
      bandedImage(
        [
          [0, 0, 0],
          [255, 255, 255],
        ],
        16,
      ),
    );
    expect(palette.verdict).toBe('reject');
    expect(palette.issues.map((i) => i.code)).toContain('too-small');
  });

  it('warns rather than rejects on low contrast', () => {
    // Two shades far enough apart to sort, but not by much: ~0.20 spread, which
    // sits between the reject and warn thresholds.
    const palette = extractPalette(
      bandedImage(
        [
          [90, 98, 115],
          [150, 158, 172],
        ],
        128,
      ),
    );
    expect(palette.verdict).toBe('warn');
    expect(palette.issues.map((i) => i.code)).toContain('low-contrast');
  });

  it('rejects a pair of shades too close to tell apart', () => {
    // ~0.12 spread: visibly two shades, but not enough range to sort a board by.
    const palette = extractPalette(
      bandedImage(
        [
          [96, 104, 120],
          [130, 138, 152],
        ],
        128,
      ),
    );
    expect(palette.verdict).toBe('reject');
    expect(palette.issues.map((i) => i.code)).toContain('narrow-range');
  });

  it('finds a chromatic key shade rather than the gray background', () => {
    // Mostly neutral gray with a smaller vivid region: the vivid one is what a
    // person would call the image's color, so salience must prefer it.
    const img = gradientImage([120, 120, 122], [126, 126, 128], 128);
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 128; x++) {
        const i = (y * 128 + x) * 4;
        img.data[i] = 220;
        img.data[i + 1] = 40;
        img.data[i + 2] = 30;
      }
    }
    const { keyShade } = extractPalette(img);
    const { C, h } = oklabToOklch(keyShade);
    expect(C).toBeGreaterThan(0.1);
    expect(h).toBeGreaterThan(10);
    expect(h).toBeLessThan(60);
  });
});
