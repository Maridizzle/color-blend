import { type Oklab, deltaE } from '../color/oklab';
import {
  type ToneSpec,
  planHuePlane,
  planTones,
  sampleHuePlane,
  sampleToneRamp,
} from '../color/tones';
import type { Lattice } from './lattice';
import type { ToneFamily } from '../color/tones';
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
  /** The colour this board should come out, assigned across its category. */
  hue?: number;
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
  const { symmetry = 0, toneCount = 1, tones, hue } = options;
  const spec = tones ?? planTones(anchors, toneCount, hue);

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

/** Normalise a list of positions to 0..1 over the values actually present. */
function spread(values: readonly number[]): number[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  return values.map((v) => (span > 1e-9 ? (v - lo) / span : 0.5));
}

/**
 * The two-colour board: a plane rather than a longer ramp.
 *
 * Lightness runs down one axis at constant hue; hue runs across the other at
 * constant lightness and chroma. That separation is the whole design, and it is
 * what two previous attempts at a second colour lacked.
 *
 * Both of those attempts put two hues on the *same* axis as the lightness, so
 * hue and lightness competed for one ordering and the player had to reconcile
 * two cues into a single sequence -- with the two hardest calls on the board
 * ("which indigo is the last indigo") landing side by side, exactly where the
 * hue cue said least. Given an axis of its own, hue stops arguing with
 * lightness: every cell has one home, read off two independent readings, and
 * neither reading is ambiguous.
 *
 * It also disposes of the Helmholtz-Kohlrausch problem rather than compensating
 * for it. Saturated colours look lighter than Oklab says, by an amount that
 * peaks at blue and vanishes at yellow, so a ramp that changes hue *while*
 * changing lightness has its apparent order pulled away from its real one. Here
 * hue is constant down a column, so the distortion is a constant offset that
 * cannot reorder anything; and across a row the task is to order hues, where a
 * lightness shift is not what is being judged. The one comparison it would
 * corrupt -- diagonal, changing both at once -- is one the grid never asks for.
 *
 * This is how the genre does it. I Love Hue's later levels lock only the four
 * corner tiles and have the player interpolate the plane between them.
 */
export function buildPlaneField(
  lattice: Lattice,
  anchors: readonly Oklab[],
  options: FieldOptions = {},
): Oklab[] {
  const { symmetry = 0, tones, hue } = options;
  const spec = tones ?? planTones(anchors, 1, hue);

  const oriented = lattice.cells.map((cell) => orientUv(cell.u, cell.v, symmetry));
  const first = spread(oriented.map(([u]) => u));
  const second = spread(oriented.map(([, v]) => v));
  const count = (values: number[]) =>
    new Set(values.map((v) => Math.round(v * 1e6))).size;

  // Hue always takes the axis with fewer positions, whichever way the symmetry
  // happened to land. Four of the eight symmetries transpose, and without this
  // half the boards came out with the hue and lightness axes swapped -- eight
  // hue columns instead of four, which is the whole arc spent again and the
  // board back to reading as a rainbow. Flips and rotation still vary freely;
  // only the roles are pinned.
  const acrossIsHue = count(first) <= count(second);
  const across = acrossIsHue ? first : second;
  const down = acrossIsHue ? second : first;

  const columns = count(across);
  const rows = count(down);
  const centre = spec.families.length > 0 ? (spec.families[0] as ToneFamily).hue : 0;
  const plan = planHuePlane(centre, columns, rows, spec.chroma);

  return lattice.cells.map((_, i) =>
    sampleHuePlane(plan, across[i] as number, down[i] as number),
  );
}

export interface FieldStats {
  /**
   * Smallest difference between two neighbours that differ at all.
   *
   * The median-max below describes a one-dimensional board well and a plane
   * badly: on a plane it reports the lightness step, which is much the larger of
   * the two axes, so a tolerance derived from it would swallow the hue axis
   * whole and make a whole row interchangeable. This is the step that has to
   * stay visible.
   */
  minPositiveNeighborDeltaE: number;
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
  let smallest = Infinity;
  for (const cell of lattice.cells) {
    const own = field[cell.id] as Oklab;
    let max = 0;
    for (const n of cell.neighbors) {
      const other = field[n];
      if (!other) continue;
      const d = deltaE(own, other);
      max = Math.max(max, d);
      if (d > 1e-9) smallest = Math.min(smallest, d);
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

  return {
    medianMaxNeighborDeltaE: median,
    minPositiveNeighborDeltaE: Number.isFinite(smallest) ? smallest : 0,
    range,
    tileCount: lattice.cells.length,
  };
}

/** Pick one of the eight orientations for this puzzle. */
export function pickSymmetry(rng: Rng): number {
  return rng.int(8);
}
