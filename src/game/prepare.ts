import type { Oklab } from '../color/oklab';
import { type Palette, extractPalette } from '../color/palette';
import { hashString } from '../util/rng';
import type { Difficulty } from '../puzzle/difficulty';
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

/**
 * Difficulty ramps through a category so the first puzzles teach the mechanic
 * before the later ones lean on it. An explicit value in the pack wins.
 */
export function specFor(subject: Subject, index: number): PuzzleShapeSpec {
  const hash = hashString(subject.id);
  const rampedDifficulty: Difficulty = index < 2 ? 'easy' : index < 5 ? 'medium' : 'hard';

  return {
    difficulty: subject.difficulty ?? rampedDifficulty,
    latticeKind: subject.latticeKind ?? (LATTICE_KINDS[hash % LATTICE_KINDS.length] as LatticeKind),
    shape: subject.shape ?? (SHAPE_POOL[(hash >>> 3) % SHAPE_POOL.length] as ShapeName),
  };
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
    // One fact per fact tile; cap so a subject with twenty facts does not turn
    // the board into a slot machine.
    factCount: Math.min(subject.facts.length, 5),
  });

  return { subject, artwork, anchors, palette, puzzle, spec };
}
