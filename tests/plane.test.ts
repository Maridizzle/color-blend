import { describe, expect, it } from 'vitest';
import { oklabToOklch, deltaE, inSrgbGamut } from '../src/color/oklab';
import { ARC_TUNING, hueSensitivityPenalty, planHuePlane, sampleHuePlane } from '../src/color/tones';
import { buildPlaneField, fieldStats } from '../src/puzzle/field';
import { squareLattice } from '../src/puzzle/lattice';
import { DIFFICULTY_TUNING } from '../src/puzzle/difficulty';
import { extractPalette } from '../src/color/palette';
import { bandedImage } from './helpers';

const PALETTE = extractPalette(
  bandedImage([[18, 22, 55], [40, 110, 150], [200, 120, 70], [240, 228, 190]], 160),
);

/** Distinct values, rounded, so float noise does not split a row in two. */
const distinct = (values: number[], places = 4) =>
  [...new Set(values.map((v) => v.toFixed(places)))];

describe('the two-colour plane', () => {
  const HUES = [2, 47, 92, 137, 182, 227, 272, 317];

  it('is separable: every lightness pairs with every hue, exactly once', () => {
    // The whole design. Two hues on the *same* axis as lightness makes them
    // compete for one ordering, which is what made both previous attempts hard.
    // Given an axis of its own, hue stops arguing with lightness and every cell
    // has one home, read off two independent readings.
    for (const symmetry of [0, 1, 2, 3, 4, 5, 6, 7]) {
      for (const [cols, rows] of [[5, 6], [6, 5], [4, 4]] as const) {
        const lattice = squareLattice(cols, rows);
        const field = buildPlaneField(lattice, PALETTE.anchors, { symmetry, hue: 92 });
        const lch = field.map((c) => oklabToOklch(c));

        const Ls = distinct(lch.map((c) => c.L));
        const Hs = distinct(lch.map((c) => c.h), 3);
        const pairs = new Set(lch.map((c) => `${c.L.toFixed(4)}|${c.h.toFixed(3)}`));

        const where = `${cols}x${rows} sym ${symmetry}`;
        expect(Ls.length * Hs.length, where).toBe(lattice.cells.length);
        expect(pairs.size, where).toBe(lattice.cells.length);
      }
    }
  });

  it('holds one chroma across the whole plane, never clipped', () => {
    // Not tidiness. Saturated colours read as lighter than they measure
    // (Helmholtz-Kohlrausch, which Oklab does not model), so chroma that varies
    // is perceived lightness that varies -- a wobble laid across the very axis
    // whose job is to rise cleanly. Letting the gamut fit clip each cell
    // individually is exactly how that creeps back in.
    for (const hue of HUES) {
      const field = buildPlaneField(squareLattice(5, 6), PALETTE.anchors, { hue });
      const chromas = distinct(field.map((c) => oklabToOklch(c).C));
      expect(chromas, `hue ${hue}`).toHaveLength(1);
    }
  });

  it('keeps both axes above the legibility floor', () => {
    // A plane is only worth having if both readings are actually readable. The
    // hue axis is the fragile one: it depends on chroma, and chroma is what the
    // sRGB gamut runs out of first.
    for (const hue of HUES) {
      const lattice = squareLattice(5, 6);
      const field = buildPlaneField(lattice, PALETTE.anchors, { hue });
      const stats = fieldStats(lattice, field);
      expect(stats.minPositiveNeighborDeltaE, `hue ${hue}`).toBeGreaterThanOrEqual(
        DIFFICULTY_TUNING.minNeighborDeltaE,
      );
    }
  });

  it('stays inside sRGB at every hue centre', () => {
    for (const hue of HUES) {
      for (const c of buildPlaneField(squareLattice(6, 6), PALETTE.anchors, { hue })) {
        expect(inSrgbGamut(c, 1e-3), `hue ${hue}`).toBe(true);
      }
    }
  });

  it('widens the arc where hue discrimination is worst, not the board’s hue', () => {
    // Hue sensitivity is sharpest around yellow-orange and dullest around blue,
    // which Oklab does not model. Nudging a blue board towards yellow would fix
    // that and undo the per-category assignment that keeps boards distinct, so
    // the arc widens instead and the centre stays put.
    expect(hueSensitivityPenalty(ARC_TUNING.sharpestHue)).toBeCloseTo(1, 6);
    expect(hueSensitivityPenalty(ARC_TUNING.sharpestHue + 180)).toBeCloseTo(
      1 + ARC_TUNING.blueWidening,
      6,
    );

    for (const hue of HUES) {
      const plan = planHuePlane(hue, 5, 6, 0.14);
      expect(plan.centreHue, `hue ${hue}`).toBe(hue);
    }
  });

  it('spaces hue evenly, which at fixed lightness and chroma is even delta-E', () => {
    // Worth pinning because it is the reason there is no separate "space by
    // delta-E" step: at constant L and C the Oklab hue circle is a circle, so
    // the distance between two hues is the chord 2*C*sin(dh/2) -- a function of
    // the step alone, not of where on the wheel it sits.
    const plan = planHuePlane(200, 6, 5, 0.12);
    const steps: number[] = [];
    for (let i = 1; i < 6; i++) {
      steps.push(
        deltaE(sampleHuePlane(plan, (i - 1) / 5, 0.5), sampleHuePlane(plan, i / 5, 0.5)),
      );
    }
    for (const step of steps) expect(step).toBeCloseTo(steps[0] as number, 6);
    expect(steps[0]).toBeCloseTo(plan.hueStep, 6);
  });

  it('takes the narrowest arc that reaches the target step', () => {
    // A wider arc than needed spends hue the board does not want and starts
    // reading as a rainbow again.
    const plenty = planHuePlane(92, 5, 6, 0.3);
    expect(plenty.hueStep).toBeGreaterThanOrEqual(
      ARC_TUNING.hueStepDeltaE * hueSensitivityPenalty(92) - 1e-9,
    );
    expect(plenty.arc).toBeLessThan(ARC_TUNING.maxArc);
  });
});
