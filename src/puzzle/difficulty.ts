import type { Oklab } from '../color/oklab';
import { type Lattice, type LatticeKind, makeLattice, maskLattice } from './lattice';
import { SHAPES, type ShapeName } from './shapes';
import { buildField, fieldStats } from './field';

/**
 * Difficulty calibration.
 *
 * This is the piece that makes blind packs work. Nobody looks at an image
 * before it becomes a puzzle, so tile count cannot be authored by hand -- and a
 * fixed tile count is wrong in both directions: a vivid image chopped into 8x8
 * is trivial, while a hazy one chopped into 20x20 is an unreadable pixel hunt.
 *
 * So difficulty is expressed as a *perceptual* target -- how different should
 * two adjacent tiles look -- and the tile count is solved for. A washed-out
 * image automatically gets fewer, larger tiles; a punchy one gets more.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_TUNING = {
  /**
   * Target perceptual step between adjacent tiles, in Oklab distance.
   * For reference ~0.02 is around the just-noticeable difference for two large
   * adjacent patches, so 'hard' really is near the limit of discrimination.
   */
  targetNeighborDeltaE: {
    easy: 0.055,
    medium: 0.035,
    hard: 0.022,
  } satisfies Record<Difficulty, number>,
  /** Locked starter tiles handed to the player as anchors. */
  lockedStarters: {
    easy: 3,
    medium: 2,
    hard: 1,
  } satisfies Record<Difficulty, number>,
  /** Probe resolution used to measure the palette's gradient steepness. */
  probeDimension: 12,
  minDimension: 4,
  maxDimension: 22,
  /** Hard ceiling on tiles, for both rendering cost and player sanity. */
  maxTiles: 560,
} as const;

/**
 * Column/row counts that make a roughly square board for a given lattice kind.
 * `n` is "tiles across" in spirit; the per-kind ratios come from each lattice's
 * cell geometry (see lattice.ts).
 */
export function latticeForDimension(kind: LatticeKind, n: number): { cols: number; rows: number } {
  const clamp = (v: number) => Math.max(2, Math.round(v));
  switch (kind) {
    case 'square':
      return { cols: clamp(n), rows: clamp(n) };
    case 'hex':
      // width = cols*sqrt(3), height = rows*1.5
      return { cols: clamp(n), rows: clamp(n * 1.1547) };
    case 'triangle': {
      // Triangles are small, so scale down to land on a comparable tile count.
      const base = n / 1.3;
      return { cols: clamp(base * 1.732), rows: clamp(base) };
    }
    case 'diamond':
      // width = cols*w, height = rows*h/2
      return { cols: clamp(n / 1.4), rows: clamp((n / 1.4) * 2) };
  }
}

export function buildBoard(
  kind: LatticeKind,
  shape: ShapeName,
  n: number,
): Lattice {
  const { cols, rows } = latticeForDimension(kind, n);
  const base = makeLattice(kind, cols, rows);
  return shape === 'full' ? base : maskLattice(base, SHAPES[shape]);
}

export interface CalibrationResult {
  lattice: Lattice;
  field: Oklab[];
  dimension: number;
  measuredNeighborDeltaE: number;
  targetNeighborDeltaE: number;
}

/**
 * Solve for the tile count that hits the difficulty's perceptual target.
 *
 * Neighbor distance scales as 1/dimension because the field is a smooth
 * function of normalized position, so one probe measurement is enough to solve
 * for the dimension directly rather than searching.
 */
export function calibrate(
  anchors: readonly Oklab[],
  kind: LatticeKind,
  shape: ShapeName,
  difficulty: Difficulty,
  symmetry: number,
): CalibrationResult {
  const target = DIFFICULTY_TUNING.targetNeighborDeltaE[difficulty];
  const probeDim = DIFFICULTY_TUNING.probeDimension;

  const probeLattice = buildBoard(kind, shape, probeDim);
  const probeField = buildField(probeLattice, anchors, { symmetry });
  const probe = fieldStats(probeLattice, probeField);

  let dimension: number = probeDim;
  if (probe.medianMaxNeighborDeltaE > 0) {
    dimension = Math.round((probeDim * probe.medianMaxNeighborDeltaE) / target);
  }
  dimension = Math.max(
    DIFFICULTY_TUNING.minDimension,
    Math.min(DIFFICULTY_TUNING.maxDimension, dimension),
  );

  let lattice = buildBoard(kind, shape, dimension);
  // Back off if the shape happens to pack in more tiles than we allow.
  while (lattice.cells.length > DIFFICULTY_TUNING.maxTiles && dimension > DIFFICULTY_TUNING.minDimension) {
    dimension--;
    lattice = buildBoard(kind, shape, dimension);
  }

  const field = buildField(lattice, anchors, { symmetry });
  const stats = fieldStats(lattice, field);

  return {
    lattice,
    field,
    dimension,
    measuredNeighborDeltaE: stats.medianMaxNeighborDeltaE,
    targetNeighborDeltaE: target,
  };
}
