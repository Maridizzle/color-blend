import type { Oklab } from '../color/oklab';
import { type Lattice, type LatticeKind, makeLattice, maskLattice } from './lattice';
import { SHAPES, type ShapeName } from './shapes';
import { buildField, fieldStats } from './field';

/**
 * How big a board gets.
 *
 * This used to work the other way round, and it was wrong. Difficulty was
 * expressed as a target *perceptual step* between adjacent tiles, and the tile
 * count was solved for. That optimises the wrong quantity: a vivid image with a
 * wide palette got *more* tiles, because the arithmetic said its shades were
 * still far enough apart to tell apart -- so the best artwork produced the
 * most punishing board. It produced boards of 350 tiles that were perfectly
 * "legible" and completely unplayable.
 *
 * The limit was never whether two shades can be distinguished side by side. It
 * is how many things a person can hold in their head and put in order. So the
 * tile count is now authored, and the perceptual step is whatever falls out of
 * it -- which works in the player's favour, since fewer tiles spanning the same
 * palette means the shades land further apart and the board reads more easily.
 *
 * The old self-calibration survives as a safety net, because it was genuinely
 * good at one thing: stopping a washed-out blind-pack image from being cut into
 * more pieces than its palette can support. See `calibrate`.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_TUNING = {
  /**
   * Tiles on the board, locked starters included. These are the numbers to
   * change if the game feels too easy or too fiddly -- nothing else needs to
   * move with them.
   */
  tileCount: {
    easy: 12,
    medium: 20,
    hard: 30,
  } satisfies Record<Difficulty, number>,

  /** Locked starter tiles handed to the player as anchors. */
  lockedStarters: {
    easy: 3,
    medium: 2,
    hard: 1,
  } satisfies Record<Difficulty, number>,

  /**
   * Hue families the board travels through, so which end is which is obvious
   * at a glance. Twelve tiles split three ways leaves four per family, too few
   * to hold a gradient within each; twenty and thirty carry three comfortably.
   */
  toneCount: {
    easy: 2,
    medium: 3,
    hard: 3,
  } satisfies Record<Difficulty, number>,

  /**
   * Adjacent tiles must differ by at least this much in Oklab, or the board
   * gets smaller until they do. Roughly twice the just-noticeable difference
   * for two large adjacent patches, so it is a comfort threshold rather than a
   * detection one. On a decent palette it never binds: 30 tiles across a 0.70
   * spread step by about 0.13.
   */
  minNeighborDeltaE: 0.04,

  /** Never go below this, even for a nearly flat palette. */
  minTiles: 6,
  /** Sanity bound on the search, well above the hardest authored count. */
  maxTiles: 60,
} as const;

/** Widest column/row counts the board search will consider. */
const SEARCH_LIMIT = 14;

export function buildBoard(kind: LatticeKind, shape: ShapeName, cols: number, rows: number): Lattice {
  const base = makeLattice(kind, cols, rows);
  return shape === 'full' ? base : maskLattice(base, SHAPES[shape]);
}

export interface CalibrationResult {
  lattice: Lattice;
  field: Oklab[];
  /** Tiles actually on the board, after any shape mask. */
  tileCount: number;
  /** What the difficulty asked for, before the legibility floor. */
  targetTileCount: number;
  measuredNeighborDeltaE: number;
}

/**
 * Find the board closest to a target tile count.
 *
 * Searching column and row counts separately rather than a single "size"
 * parameter matters at these small sizes: a square lattice built n-by-n can
 * only produce 9, 16, 25 ... and so can never land on 12. Ties break toward a
 * board that is close to square, so a 12-tile square grid comes out 4x3 rather
 * than 12x1. Boards this small cost nothing to build, so the search is
 * exhaustive rather than clever.
 */
export function boardForTileCount(
  kind: LatticeKind,
  shape: ShapeName,
  target: number,
): Lattice {
  let best: Lattice | null = null;
  let bestScore = Infinity;

  for (let cols = 2; cols <= SEARCH_LIMIT; cols++) {
    for (let rows = 2; rows <= SEARCH_LIMIT; rows++) {
      const lattice = buildBoard(kind, shape, cols, rows);
      const count = lattice.cells.length;
      if (count < 3 || count > DIFFICULTY_TUNING.maxTiles) continue;

      // Hitting the count dominates; squareness only settles ties. The aspect
      // term is scaled to stay below one tile's worth of penalty.
      const aspect = Math.abs(Math.log(lattice.width / lattice.height));
      const score = Math.abs(count - target) + Math.min(aspect, 2) * 0.4;

      if (score < bestScore) {
        bestScore = score;
        best = lattice;
      }
    }
  }

  // Only reachable if every candidate was rejected, which the bounds prevent.
  return best ?? buildBoard(kind, shape, 4, 4);
}

/**
 * Build the board for a difficulty, then check the palette can actually carry
 * it.
 *
 * The floor check is the part worth keeping from the old design. Packs arrive
 * blind, and an image whose shades barely separate would otherwise be cut into
 * a full-size board of tiles nobody can order. Stepping the target down until
 * adjacent tiles clear `minNeighborDeltaE` costs nothing on a good palette and
 * rescues a poor one.
 */
export function calibrate(
  anchors: readonly Oklab[],
  kind: LatticeKind,
  shape: ShapeName,
  difficulty: Difficulty,
  symmetry: number,
): CalibrationResult {
  const targetTileCount = DIFFICULTY_TUNING.tileCount[difficulty];
  const toneCount = DIFFICULTY_TUNING.toneCount[difficulty];

  let target = targetTileCount;
  let lattice = boardForTileCount(kind, shape, target);
  let field = buildField(lattice, anchors, { symmetry, toneCount });
  let measured = fieldStats(lattice, field).medianMaxNeighborDeltaE;

  while (
    measured < DIFFICULTY_TUNING.minNeighborDeltaE &&
    lattice.cells.length > DIFFICULTY_TUNING.minTiles
  ) {
    // Aim below the count actually achieved, so a target the search rounds up
    // from cannot leave this loop spinning on the same board.
    const next = Math.min(target, lattice.cells.length) - 2;
    if (next < DIFFICULTY_TUNING.minTiles) break;

    target = next;
    lattice = boardForTileCount(kind, shape, target);
    field = buildField(lattice, anchors, { symmetry });
    measured = fieldStats(lattice, field).medianMaxNeighborDeltaE;
  }

  return {
    lattice,
    field,
    tileCount: lattice.cells.length,
    targetTileCount,
    measuredNeighborDeltaE: measured,
  };
}
