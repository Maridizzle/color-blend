import type { Oklab } from '../color/oklab';
import { type Rng, hashString, makeRng, shuffleInPlace } from '../util/rng';
import type { Cell, Lattice, LatticeKind } from './lattice';
import type { ShapeName } from './shapes';
import { pickSymmetry } from './field';
import { DIFFICULTY_TUNING, type Difficulty, calibrate, isTwoColour } from './difficulty';
import { type Arrangement, countCorrect, isCellCorrect, isSolved, swap } from './solve';

export const GENERATOR_TUNING = {
  /** Correctness tolerance as a fraction of the board's neighbor step. */
  toleranceFraction: 0.45,
  /** A shuffle leaving more than this share already correct is a weak shuffle. */
  maxPreCorrectFraction: 0.15,
  /** Shuffle attempts before settling for the best one seen. */
  shuffleAttempts: 40,
} as const;

export interface Puzzle {
  id: string;
  seed: number;
  difficulty: Difficulty;
  latticeKind: LatticeKind;
  shape: ShapeName;
  lattice: Lattice;
  /** Target color per cell id. */
  targets: Oklab[];
  /** Tile colors, indexed by tile. Tile i starts life as the target of cell i. */
  tileColors: Oklab[];
  /** order[cellId] = tile index currently in that cell. */
  order: number[];
  /** Cells the player cannot move: the starter anchors. */
  locked: boolean[];
  /** Cells that reveal a fact when they land correctly. */
  factCells: number[];
  tolerance: number;
  stats: {
    tileCount: number;
    /** What the difficulty asked for; differs only if the legibility floor bit. */
    targetTileCount: number;
    measuredNeighborDeltaE: number;
  };
}

export interface GenerateOptions {
  id: string;
  anchors: readonly Oklab[];
  difficulty?: Difficulty;
  latticeKind?: LatticeKind;
  shape?: ShapeName;
  /**
   * The colour this board comes out, assigned across its category so no two
   * boards repeat. Omitted, the board takes its artwork's own dominant hue.
   */
  hue?: number;
  /** Number of fact tiles to plant; capped by the facts actually available. */
  factCount?: number;
  seed?: number;
}

/**
 * Pick `count` cells that are spread as far apart as possible (farthest-point
 * sampling), optionally seeded from cells that already exist. Used for both
 * starter anchors and fact tiles so neither clusters in one corner.
 */
function spreadCells(
  cells: readonly Cell[],
  candidates: readonly number[],
  count: number,
  seededWith: readonly number[] = [],
): number[] {
  if (count <= 0 || candidates.length === 0) return [];

  const chosen: number[] = [];
  const anchorsForDistance = [...seededWith];

  const distanceToSet = (id: number) => {
    if (anchorsForDistance.length === 0) return Infinity;
    const cell = cells[id] as Cell;
    return Math.min(
      ...anchorsForDistance.map((other) => {
        const o = cells[other] as Cell;
        return Math.hypot(cell.cx - o.cx, cell.cy - o.cy);
      }),
    );
  };

  while (chosen.length < count && chosen.length < candidates.length) {
    let best = -1;
    let bestDistance = -1;
    for (const id of candidates) {
      if (chosen.includes(id)) continue;
      const d = distanceToSet(id);
      if (d > bestDistance) {
        bestDistance = d;
        best = id;
      }
    }
    if (best < 0) break;
    chosen.push(best);
    anchorsForDistance.push(best);
  }
  return chosen;
}

/** Cells nearest the four corners of the board, dark corner first. */
function cornerCells(lattice: Lattice, symmetry: number): number[] {
  // Corner (0,0) in oriented space always holds the darkest anchor, so walking
  // the corners in this order hands the player the extremes first.
  const orientedCorners: [number, number][] = [
    [0, 0],
    [1, 1],
    [1, 0],
    [0, 1],
  ];
  const inverse = (u: number, v: number): [number, number] => {
    // orientUv is an involution for the reflect bits but not for transpose, so
    // invert by searching the tiny symmetry group rather than deriving it.
    const s = ((symmetry % 8) + 8) % 8;
    let x = u;
    let y = v;
    if (s & 1) x = 1 - x;
    if (s & 2) y = 1 - y;
    if (s & 4) [x, y] = [y, x];
    return [x, y];
  };

  return orientedCorners.map(([ou, ov]) => {
    const [u, v] = inverse(ou, ov);
    let best = 0;
    let bestD = Infinity;
    for (const cell of lattice.cells) {
      const d = Math.hypot(cell.u - u, cell.v - v);
      if (d < bestD) {
        bestD = d;
        best = cell.id;
      }
    }
    return best;
  });
}

/**
 * Shuffle the movable tiles, then check the shuffle is actually worth solving.
 *
 * Two failure modes to avoid: a shuffle that happens to leave the board nearly
 * done, and -- on boards with lots of interchangeable shades -- a shuffle that
 * is "correct" everywhere by accident. Keeps the best of several attempts
 * rather than looping forever, since some palettes cannot do better.
 */
function shuffleArrangement(
  base: Arrangement,
  movable: readonly number[],
  rng: Rng,
): number[] {
  const total = base.order.length;
  const limit = Math.max(1, Math.floor(movable.length * GENERATOR_TUNING.maxPreCorrectFraction));

  let best: number[] | null = null;
  let bestCorrect = Infinity;

  for (let attempt = 0; attempt < GENERATOR_TUNING.shuffleAttempts; attempt++) {
    const order = [...base.order];
    const tiles = shuffleInPlace(
      movable.map((cellId) => base.order[cellId] as number),
      rng,
    );
    movable.forEach((cellId, i) => {
      order[cellId] = tiles[i] as number;
    });

    const candidate: Arrangement = { ...base, order };
    if (isSolved(candidate)) continue;

    // Locked cells are correct by construction; only judge the movable ones.
    const correct = countCorrect(candidate) - (total - movable.length);
    if (correct <= limit) return order;
    if (correct < bestCorrect) {
      bestCorrect = correct;
      best = order;
    }
  }

  return best ?? [...base.order];
}

/**
 * A fact only fires when its tile *becomes* correct, so a fact tile that the
 * shuffle happened to leave in the right place would lock its fact away
 * forever. Swap any such tile out with an incorrect one so every fact on the
 * board is actually earnable.
 */
function ensureFactCellsStartWrong(
  factCells: readonly number[],
  movable: readonly number[],
  arrangement: Arrangement,
  rng: Rng,
): void {
  const factSet = new Set(factCells);
  for (const cell of factCells) {
    if (!isCellCorrect(arrangement, cell)) continue;

    const partners = movable.filter(
      (other) => other !== cell && !factSet.has(other) && !isCellCorrect(arrangement, other),
    );
    if (partners.length === 0) continue;

    const partner = rng.pick(partners);
    swap(arrangement.order, cell, partner);
    // Only accept the swap if it actually moved the fact tile off correct.
    if (isCellCorrect(arrangement, cell)) swap(arrangement.order, cell, partner);
  }
}

export function generatePuzzle(options: GenerateOptions): Puzzle {
  const {
    id,
    anchors,
    difficulty = 'medium',
    latticeKind = 'square',
    shape = 'full',
    hue,
    factCount = 0,
    seed = hashString(id),
  } = options;

  if (anchors.length < 2) {
    throw new Error(`Cannot build a puzzle for "${id}": needs at least 2 anchor colors.`);
  }

  const rng = makeRng(seed);
  const symmetry = pickSymmetry(rng);
  const {
    lattice,
    field,
    tileCount,
    targetTileCount,
    measuredNeighborDeltaE,
    toleranceBasis,
  } = calibrate(
    anchors,
    latticeKind,
    shape,
    difficulty,
    symmetry,
    hue,
  );

  const targets = field;
  const tileColors = [...field];
  const tolerance = Math.max(
    1e-4,
    GENERATOR_TUNING.toleranceFraction * toleranceBasis,
  );

  // Starter anchors: the corner cells, which are the extremes of the gradient
  // and so the most useful thing a player can be handed for free.
  const starterCount = Math.min(
    isTwoColour(difficulty)
      ? DIFFICULTY_TUNING.planeStarters
      : DIFFICULTY_TUNING.lockedStarters[difficulty],
    Math.max(1, lattice.cells.length - 2),
  );
  // Corners can collide on very small or heavily masked boards, so dedupe
  // before slicing or the player silently gets fewer starters than promised.
  const lockedIds = [...new Set(cornerCells(lattice, symmetry))].slice(0, starterCount);
  const locked = lattice.cells.map((c) => lockedIds.includes(c.id));

  const movable = lattice.cells.filter((c) => !locked[c.id]).map((c) => c.id);

  const base: Arrangement = {
    order: lattice.cells.map((c) => c.id),
    tileColors,
    targets,
    tolerance,
  };
  const order = shuffleArrangement(base, movable, rng);

  // Fact tiles are unmarked, so spread them out: clustered ones would all fire
  // at once and the reward would land as a single burst rather than a trickle.
  const factCells = spreadCells(lattice.cells, movable, factCount, lockedIds);
  ensureFactCellsStartWrong(factCells, movable, { ...base, order }, rng);

  return {
    id,
    seed,
    difficulty,
    latticeKind,
    shape,
    lattice,
    targets,
    tileColors,
    order,
    locked,
    factCells,
    tolerance,
    stats: {
      tileCount,
      targetTileCount,
      measuredNeighborDeltaE,
    },
  };
}

/** The live arrangement view of a puzzle, for the solve helpers. */
export function arrangementOf(puzzle: Puzzle): Arrangement {
  return {
    order: puzzle.order,
    tileColors: puzzle.tileColors,
    targets: puzzle.targets,
    tolerance: puzzle.tolerance,
  };
}
