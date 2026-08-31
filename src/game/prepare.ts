import type { Oklab } from '../color/oklab';
import { type Palette, extractPalette } from '../color/palette';
import { hashString } from '../util/rng';
import { DIFFICULTY_TUNING, type Difficulty } from '../puzzle/difficulty';
import type { LatticeKind } from '../puzzle/lattice';
import { SHAPE_NAMES, type ShapeName } from '../puzzle/shapes';
import { type Puzzle, generatePuzzle } from '../puzzle/generator';
import { loadArtwork } from '../content/artwork';
import type { Artwork, Subject } from '../content/types';

/**
 * Subject -> playable puzzle.
 *
 * Board shape and lattice are derived from the subject id rather than chosen at
 * random, so a subject always looks like itself, and rather than authored, so a
 * blind pack of forty images still yields forty visually distinct boards with
 * nobody having picked any of them.
 */

const LATTICE_KINDS: LatticeKind[] = ['square', 'hex', 'triangle', 'diamond'];
/** 'full' twice so plain rectangular boards stay the most common. */
const SHAPE_POOL: ShapeName[] = ['full', 'full', ...SHAPE_NAMES.filter((s) => s !== 'full')];

export interface PuzzleShapeSpec {
  difficulty: Difficulty;
  latticeKind: LatticeKind;
  shape: ShapeName;
}

/** Below this many tiles a carved silhouette stops reading as a shape. */
const MIN_TILES_FOR_SHAPE = 16;

/**
 * Difficulty ramps through a category so the first puzzles teach the mechanic
 * before the later ones lean on it. An explicit value in the pack wins.
 */
export function specFor(subject: Subject, index: number): PuzzleShapeSpec {
  const hash = hashString(subject.id);
  const rampedDifficulty: Difficulty = index < 2 ? 'easy' : index < 5 ? 'medium' : 'hard';
  const difficulty = subject.difficulty ?? rampedDifficulty;

  // A leaf or an arch cut out of a dozen cells does not read as a leaf or an
  // arch; it reads as a board with bits missing. Small boards stay rectangular
  // unless the pack asked for a shape by name.
  const roomForShape = DIFFICULTY_TUNING.tileCount[difficulty] >= MIN_TILES_FOR_SHAPE;
  const derivedShape = roomForShape
    ? (SHAPE_POOL[(hash >>> 3) % SHAPE_POOL.length] as ShapeName)
    : 'full';

  return {
    difficulty,
    latticeKind: subject.latticeKind ?? (LATTICE_KINDS[hash % LATTICE_KINDS.length] as LatticeKind),
    shape: subject.shape ?? derivedShape,
  };
}

/**
 * How many tiles hide a fact.
 *
 * Roughly one in eight, so a small board does not fire a pop-up every other
 * move and drown out the sorting. Capped at five because that is as many as any
 * subject carries, and floored at two so even the smallest board teaches
 * something.
 */
export function factCountFor(tileCount: number, availableFacts: number): number {
  return Math.min(availableFacts, Math.max(2, Math.round(tileCount / 8)), 5);
}

export interface PreparedPuzzle {
  subject: Subject;
  artwork: Artwork;
  anchors: readonly Oklab[];
  /** Absent when the subject arrived with anchors already computed. */
  palette?: Palette;
  puzzle: Puzzle;
  spec: PuzzleShapeSpec;
}

/**
 * Load a subject's artwork, work out its gradient anchors, and build the board.
 *
 * A subject that came through pack ingest already carries validated anchors, so
 * play reuses them: it skips the expensive clustering pass, and guarantees the
 * board a player sees is built from exactly the palette that was checked.
 * Sampler artworks are analyzed here on first play.
 */
export async function preparePuzzle(subject: Subject, index: number): Promise<PreparedPuzzle> {
  const artwork = await loadArtwork(subject.artwork);

  let anchors = subject.anchors;
  let palette: Palette | undefined;
  if (!anchors || anchors.length < 2) {
    palette = extractPalette(artwork.pixels);
    anchors = palette.anchors;

    if (palette.verdict === 'reject' || anchors.length < 2) {
      const why = palette.issues.map((i) => i.message).join(' ') || 'not enough distinct shades.';
      throw new Error(`"${subject.title}" cannot be made into a puzzle: ${why}`);
    }
  }

  const spec = specFor(subject, index);
  const puzzle: Puzzle = generatePuzzle({
    id: subject.id,
    anchors,
    difficulty: spec.difficulty,
    latticeKind: spec.latticeKind,
    shape: spec.shape,
    factCount: factCountFor(DIFFICULTY_TUNING.tileCount[spec.difficulty], subject.facts.length),
  });

  return { subject, artwork, anchors, palette, puzzle, spec };
}
