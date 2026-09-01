import type { Oklab } from '../color/oklab';
import { type Palette, extractPalette } from '../color/palette';
import { hashString } from '../util/rng';
import { DIFFICULTY_TUNING, type Difficulty, isTwoColour } from '../puzzle/difficulty';
import type { LatticeKind } from '../puzzle/lattice';
import {
  SHAPE_LATTICES,
  SHAPE_MIN_TILES,
  SHAPE_NAMES,
  type ShapeName,
} from '../puzzle/shapes';
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

/**
 * Step through the shape list rather than taking them in order, so consecutive
 * subjects are not a circle followed by a hexagon followed by a diamond. Coprime
 * with the number of shapes, so it still visits all of them, and coprime with
 * the number of lattices too -- which is what makes (lattice, shape) unique for
 * the first 52 subjects instead of repeating every twelfth.
 */
const SHAPE_STRIDE = 5;

export interface PuzzleShapeSpec {
  difficulty: Difficulty;
  latticeKind: LatticeKind;
  shape: ShapeName;
}


/**
 * Difficulty ramps through a category so the first puzzles teach the mechanic
 * before the later ones lean on it. An explicit value in the pack wins.
 */
export function specFor(
  subject: Subject,
  index: number,
  total = 1,
  categoryId = '',
): PuzzleShapeSpec {
  const difficulty = subject.difficulty ?? rampedDifficulty(index, total);
  const tiles = DIFFICULTY_TUNING.tileCount[difficulty];

  // A two-colour board is read as rows and columns, so it has to have them: a
  // plain rectangle on a square lattice. A leaf or a ring has no rows. This
  // overrides a pack's own choice rather than deferring to it, because the
  // alternative is a board whose two axes cannot be seen.
  if (isTwoColour(difficulty)) {
    return { difficulty, latticeKind: 'square', shape: 'full' };
  }

  // Position in the category, not a hash of the id. A hash gives each subject a
  // stable board but says nothing about its neighbours, so across twenty
  // subjects it collides and the same handful of boards keep coming back.
  // Walking the lists guarantees the set is varied, which is the property that
  // actually matters once a category is longer than a few puzzles.
  //
  // The category offset stops a second category being a re-run of the first:
  // without it every category opens with the same square grid, then the same
  // hexagon, in the same order.
  const offset = categoryId ? hashString(categoryId) : 0;

  const latticeKind =
    subject.latticeKind ??
    (LATTICE_KINDS[(index + offset) % LATTICE_KINDS.length] as LatticeKind);

  return {
    difficulty,
    latticeKind,
    shape:
      subject.shape ??
      // `tiles` joins the walk position because each difficulty tier has its own
      // set of eligible shapes, and without it two subjects on the same lattice
      // in different tiers can walk to the same one -- Andromeda and Saturn both
      // came out as a squircle of triangles.
      shapeForTiles(index * SHAPE_STRIDE + offset + tiles, tiles, latticeKind),
  };
}

/**
 * Step through the shapes that read at this tile count.
 *
 * Silhouettes carry their own minimum (see `SHAPE_MIN_TILES`) rather than every
 * shape waiting on one blanket threshold -- a twelve-tile circle is obviously a
 * circle, and a twelve-tile star is a smudge.
 *
 * Eligibility is both a tile count and the lattice: some outlines only survive
 * being carved out of certain packings (see `SHAPE_LATTICES`).
 *
 * The eligible shapes are filtered out *before* indexing rather than scanning
 * forward from the walk position to the next one that fits. Scanning looks
 * equivalent and is not: every position that lands on a shape too detailed for
 * the board slides to the same next fitting one, so a run of easy boards came
 * out as four crosses and four squircles. Filtering first keeps the stride
 * coprime with however many shapes are actually available.
 */
function shapeForTiles(from: number, tiles: number, kind: LatticeKind): ShapeName {
  const eligible = SHAPE_NAMES.filter(
    (s) => tiles >= SHAPE_MIN_TILES[s] && SHAPE_LATTICES[s].includes(kind),
  );
  if (eligible.length === 0) return 'full';
  return eligible[((from % eligible.length) + eligible.length) % eligible.length] as ShapeName;
}

/**
 * Difficulty across a category, as a fraction of the way through rather than at
 * fixed indices: roughly the first third easy, the middle medium, the last third
 * hard. Fixed cut-offs were written for a category of four and would have made
 * fifteen of twenty subjects hard.
 */
function rampedDifficulty(index: number, total: number): Difficulty {
  const through = total <= 1 ? 0 : index / (total - 1);
  return through < 0.3 ? 'easy' : through < 0.7 ? 'medium' : 'hard';
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
export async function preparePuzzle(
  subject: Subject,
  index: number,
  total = 1,
  categoryId = '',
): Promise<PreparedPuzzle> {
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

  const spec = specFor(subject, index, total, categoryId);
  const puzzle: Puzzle = generatePuzzle({
    id: subject.id,
    anchors,
    difficulty: spec.difficulty,
    latticeKind: spec.latticeKind,
    shape: spec.shape,
    hue: subject.hue,
    factCount: factCountFor(DIFFICULTY_TUNING.tileCount[spec.difficulty], subject.facts.length),
  });

  return { subject, artwork, anchors, palette, puzzle, spec };
}
