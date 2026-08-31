import { type Oklab, deltaE, mix } from '../color/oklab';
import { fitToGamut } from '../color/gamut';
import type { Lattice } from './lattice';
import type { Rng } from '../util/rng';

/**
 * The gradient field: the color every cell is supposed to end up holding.
 *
 * Design constraint that drives everything here: the board must be *sortable*.
 * A player told to run darkest to lightest has to be able to succeed by looking
 * at the tiles, with no hidden information. So the field is a smooth
 * interpolation between a handful of anchor colors taken from the artwork, with
 * the darkest and lightest anchors pinned to opposite corners.
 *
 * Interpolation is bilinear over four corner colors. That choice is load
 * bearing. The obvious alternative, inverse-distance weighting, is *not*
 * linearly precise: even with two anchors it produces an S-curve that piles
 * most tiles up near the two anchor colors and leaves the middle sparse, which
 * is exactly the wrong distribution for a sorting puzzle. Bilinear gives an
 * even spread of shades across the board.
 */

/** The four corner colors, in order (0,0), (1,0), (1,1), (0,1). */
export type CornerColors = readonly [Oklab, Oklab, Oklab, Oklab];

/**
 * Turn 2-4 anchors, sorted dark to light, into four corner colors with the
 * darkest and lightest diagonally opposed.
 *
 * With exactly two anchors every color in the field necessarily lies on a line
 * in Oklab, so bands of identical color are unavoidable; the 0.35/0.65 split
 * at least spreads the shades evenly rather than doubling one up.
 */
export function cornersFromAnchors(anchors: readonly Oklab[]): CornerColors {
  if (anchors.length === 0) throw new Error('cornersFromAnchors needs at least one anchor');
  if (anchors.length === 1) {
    const only = anchors[0] as Oklab;
    return [only, only, only, only];
  }

  const dark = anchors[0] as Oklab;
  const light = anchors[anchors.length - 1] as Oklab;

  if (anchors.length === 2) {
    return [dark, mix(dark, light, 0.35), light, mix(dark, light, 0.65)];
  }
  if (anchors.length === 3) {
    const mid = anchors[1] as Oklab;
    return [dark, mid, light, mix(mid, mix(dark, light, 0.5), 0.5)];
  }
  // Four or more: the two darkest-and-lightest go on one diagonal, the two most
  // interesting mid shades on the other.
  return [dark, anchors[1] as Oklab, light, anchors[2] as Oklab];
}

/**
 * One of the eight symmetries of the square, applied to (u,v).
 *
 * Purely cosmetic but it matters: without it every board in the game runs dark
 * from the same corner and the whole category looks like one puzzle repeated.
 */
export function orientUv(u: number, v: number, symmetry: number): [number, number] {
  const s = ((symmetry % 8) + 8) % 8;
  let x = u;
  let y = v;
  if (s & 4) [x, y] = [y, x]; // transpose
  if (s & 1) x = 1 - x;
  if (s & 2) y = 1 - y;
  return [x, y];
}

export interface FieldOptions {
  /** Which of the eight square symmetries to orient the gradient by. */
  symmetry?: number;
}

/** Bilinear blend of four corner colors at normalized position (u,v). */
export function sampleCorners(corners: CornerColors, u: number, v: number): Oklab {
  const [c00, c10, c11, c01] = corners;
  const top = mix(c00, c10, u);
  const bottom = mix(c01, c11, u);
  return mix(top, bottom, v);
}

/**
 * Build the target color for every cell in a lattice.
 * Results are gamut-fitted, so they are all exactly representable in sRGB.
 */
export function buildField(
  lattice: Lattice,
  anchors: readonly Oklab[],
  options: FieldOptions = {},
): Oklab[] {
  const { symmetry = 0 } = options;
  const corners = cornersFromAnchors(anchors);
  return lattice.cells.map((cell) => {
    const [u, v] = orientUv(cell.u, cell.v, symmetry);
    return fitToGamut(sampleCorners(corners, u, v));
  });
}

export interface FieldStats {
  /**
   * Median over cells of each cell's largest neighbor difference.
   *
   * Taking the *largest* per cell rather than the average is deliberate: on a
   * two-anchor board whole diagonals share one color, and averaging would drown
   * the real gradient step in a pile of zeros. This measures the step the
   * player actually has to perceive.
   */
  medianMaxNeighborDeltaE: number;
  /** Full perceptual range present on the board. */
  range: number;
  tileCount: number;
}

export function fieldStats(lattice: Lattice, field: readonly Oklab[]): FieldStats {
  const perCell: number[] = [];
  for (const cell of lattice.cells) {
    const own = field[cell.id] as Oklab;
    let max = 0;
    for (const n of cell.neighbors) {
      const other = field[n];
      if (other) max = Math.max(max, deltaE(own, other));
    }
    if (cell.neighbors.length > 0) perCell.push(max);
  }
  perCell.sort((a, b) => a - b);
  const median =
    perCell.length === 0 ? 0 : (perCell[Math.floor(perCell.length / 2)] as number);

  let range = 0;
  for (let i = 0; i < field.length; i++) {
    for (let j = i + 1; j < field.length; j++) {
      range = Math.max(range, deltaE(field[i] as Oklab, field[j] as Oklab));
    }
  }

  return { medianMaxNeighborDeltaE: median, range, tileCount: lattice.cells.length };
}

/** Pick one of the eight orientations for this puzzle. */
export function pickSymmetry(rng: Rng): number {
  return rng.int(8);
}
