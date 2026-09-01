import { type Oklab, deltaE } from '../color/oklab';
import { type ToneSpec, planTones, sampleToneRamp } from '../color/tones';
import type { Lattice } from './lattice';
import type { Rng } from '../util/rng';

/**
 * The gradient field: the color every cell is supposed to end up holding.
 *
 * Design constraint that drives everything here: the board must be *sortable*.
 * A player told to run darkest to lightest has to be able to succeed by looking
 * at the tiles, with no hidden information.
 *
 * The field is one-dimensional. Every cell is projected onto a single oriented
 * axis and takes its color from that position along a tone ramp (see
 * `src/color/tones.ts`). This replaced a two-dimensional bilinear blend of four
 * corner colors, which was the right shape when boards ran to hundreds of tiles
 * and the wrong one at twelve: a player cannot infer a two-dimensional
 * arrangement from a dozen swatches. One axis makes the rule literal -- dark at
 * one end, light at the other, and now cool at one end and warm at the other
 * too.
 *
 * Cells that project to the same position share a color, which keeps the
 * fairness property `solve.ts` relies on: colors a player cannot tell apart are
 * genuinely interchangeable and either placement counts.
 */

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
  /** Hue families the ramp travels through. One is a single-colour value scale. */
  toneCount?: number;
  /** Reuse a plan already made, so a board and its report agree. */
  tones?: ToneSpec;
}

/**
 * Position along the sort axis, 0 at the dark end and 1 at the light end.
 *
 * The diagonal rather than a single edge: it uses the whole board, so a wide
 * board does not compress the ramp into a few columns, and every cell gets a
 * distinct-ish position on any lattice shape.
 */
export function axisPosition(u: number, v: number): number {
  return (u + v) / 2;
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
  const { symmetry = 0, toneCount = 1, tones } = options;
  const spec = tones ?? planTones(anchors, toneCount);

  // Normalise over the positions actually present. A masked silhouette may not
  // reach the corners of its bounding box, and without this its ramp would stop
  // short of both ends and lose the very contrast the tones are there to give.
  const positions = lattice.cells.map((cell) => {
    const [u, v] = orientUv(cell.u, cell.v, symmetry);
    return axisPosition(u, v);
  });
  const lo = Math.min(...positions);
  const hi = Math.max(...positions);
  const span = hi - lo;

  return positions.map((p) => sampleToneRamp(spec, span > 1e-9 ? (p - lo) / span : 0.5));
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
