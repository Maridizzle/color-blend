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
   * Hue families the board travels through.
   *
   * One. The sort is then a pure value scale -- a single colour running dark to
   * light -- and every tile can be placed by asking one question, "is this
   * lighter or darker than that one", with no second judgement about which
   * family it belongs to first.
   *
   * Two and three were tried and were too hard to play, which is worth
   * recording because the reasoning for them was sound and still wrong. Extra
   * families make the *ends* unmistakable, so they look easier: a glance tells
   * you which pile is which. What they cost is the middle. A family boundary
   * splits the ramp into groups whose internal ordering has to be worked out
   * separately, and it puts the two hardest decisions on the board -- which
   * indigo is the last indigo, which gold is the first gold -- right next to
   * each other, where the colour cue is weakest by construction.
   *
   * `src/color/tones.ts` still handles any number of families and is still
   * tested for it, so this is one constant to change if a category ever wants
   * a harder board. The count is a ceiling either way: an artwork with one hue
   * yields one whatever this says.
   */
  toneCount: {
    easy: 1,
    medium: 1,
    hard: 1,
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
/** Narrowest. A two-wide board cannot be any of the silhouettes on offer. */
const SEARCH_MIN = 3;

/**
 * How far from square a board may be, as width/height.
 *
 * A gate rather than a scoring term. This began as a small penalty added after
 * the count difference, capped below one tile's worth, which meant any board
 * hitting the target exactly beat every squarer board that missed by one. A
 * twenty-tile "circle of hexagons" came out as a two-wide zigzag eleven rows
 * tall, because hexLattice(2, 11) minus two clipped corners is exactly twenty.
 * Landing within a tile or two of the target matters far less than the board
 * being the shape it says it is.
 */
const ASPECT_MIN = 0.62;
const ASPECT_MAX = 1.6;

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
  // Widen the gate if a lattice-and-shape pair cannot make anything square
  // enough, rather than returning nothing.
  for (const slack of [1, 1.35, 1.8, 4]) {
    const found = searchBoards(kind, shape, target, ASPECT_MIN / slack, ASPECT_MAX * slack);
    if (found) return found;
  }
  // Nothing in the whole search was both the right shape and big enough. Grow a
  // plain board until it clears the floor, so the caller always gets a playable
  // board rather than whatever a fixed 4x4 happens to carve down to.
  for (let size = 4; size <= SEARCH_LIMIT; size++) {
    const lattice = buildBoard(kind, shape, size, size);
    if (lattice.cells.length >= DIFFICULTY_TUNING.minTiles) return lattice;
  }
  return buildBoard(kind, shape, SEARCH_LIMIT, SEARCH_LIMIT);
}

function searchBoards(
  kind: LatticeKind,
  shape: ShapeName,
  target: number,
  aspectMin: number,
  aspectMax: number,
): Lattice | null {
  let best: Lattice | null = null;
  let bestScore = Infinity;

  for (let cols = SEARCH_MIN; cols <= SEARCH_LIMIT; cols++) {
    for (let rows = SEARCH_MIN; rows <= SEARCH_LIMIT; rows++) {
      const lattice = buildBoard(kind, shape, cols, rows);
      const count = lattice.cells.length;
      // The floor is minTiles, not some token 3. A silhouette carves cells away,
      // so a lattice big enough on paper can come back below what a board is
      // allowed to be -- a star at a small target keeps only its points.
      if (count < DIFFICULTY_TUNING.minTiles || count > DIFFICULTY_TUNING.maxTiles) continue;

      // Shape first: a board outside the band is not a candidate at all, however
      // exactly it hits the count.
      const aspect = lattice.width / lattice.height;
      if (aspect < aspectMin || aspect > aspectMax) continue;

      // Among boards that are the right shape, take the closest count, with
      // squareness settling ties.
      const score = Math.abs(count - target) + Math.abs(Math.log(aspect)) * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = lattice;
      }
    }
  }
  return best;
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
  hue?: number,
): CalibrationResult {
  const targetTileCount = DIFFICULTY_TUNING.tileCount[difficulty];
  const toneCount = DIFFICULTY_TUNING.toneCount[difficulty];

  let target = targetTileCount;
  let lattice = boardForTileCount(kind, shape, target);
  let field = buildField(lattice, anchors, { symmetry, toneCount, hue });
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
    // Same options as the first build: dropping them here once left the retry
    // measuring a different board from the one it was about to return.
    field = buildField(lattice, anchors, { symmetry, toneCount, hue });
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
