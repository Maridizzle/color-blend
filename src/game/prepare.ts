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
 * the number of lattices too, so the walk does not fall into step with them.
 *
 * On its own the stride cannot promise that no two boards in a category share
 * a lattice and a silhouette: each board draws from its own pool of eligible
 * shapes, which grows with its tile count, so two walks through pools of
 * different sizes can land on the same name. That promise is kept below, by
 * stepping past anything already taken.
 */
const SHAPE_STRIDE = 5;

/**
 * The difficulty ramp, and it runs along the *whole road*, not within one
 * archive. The first Cosmos board is the smallest and simplest the game has;
 * every board after it is a little larger. A player is never dropped in at the
 * deep end, and never made to start over from easy when a new archive opens --
 * which is what a per-archive ramp did, and why the first archive felt hard: it
 * held the hardest boards in the game a few puzzles from the start.
 *
 * The road has no end -- levels are meant to be added for as long as anyone
 * cares to add them -- so the ramp is built to never run away. Two shapes to it:
 *
 *   - The tile count *saturates*. It climbs quickly at first and then flattens
 *     into a long, gentle plateau it approaches but never reaches. Tile count
 *     alone cannot carry difficulty forever -- eventually a new mechanic must --
 *     so rather than pretend otherwise it settles at a fair, playable size and
 *     holds there, however deep the road runs.
 *
 *   - The two-colour plane, the one genuinely hard board, is held back as a rare
 *     capstone: the last board or two of the *deepest* archives only, and never
 *     more than a few. So no archive is ever a wall of them, and the newest
 *     archive on the road is never the hardest thing in the game -- because the
 *     newest archive is, almost always, not really the last.
 */
export const DIFFICULTY_RAMP = {
  /** Tiles on the very first board. */
  minTiles: 8,
  /**
   * The size one-colour boards climb toward and hold at. Approached, never
   * quite reached, so no board ever runs away as the road lengthens.
   */
  maxTiles: 26,
  /**
   * Journey, in archives, at which the climb from min to max is half done.
   * Small enough that the first archives feel a real progression, large enough
   * that it soon flattens into the plateau an endless road needs.
   */
  halfLife: 6,
  /** Below this progress a board hands over a few extra locked anchors. */
  easyUntil: 0.28,
  /**
   * The first archive (0-based) whose tail can be a two-colour plane. Set past
   * the end of the shipped road, so the current archives are all one colour and
   * the plane returns only as the road grows deeper than it is today.
   */
  planeFromArchive: 7,
  /** The most plane boards any one archive ever ends on. */
  planeCap: 3,
} as const;

/**
 * Progress along the road, 0..1, rising fast then flattening. Journey is the
 * archive's place on the road plus how far through it a board sits, so it climbs
 * smoothly across the whole road and settles into a plateau it never tops.
 */
function rampProgress(index: number, total: number, roadIndex: number): number {
  const throughArchive = total <= 1 ? 0 : index / (total - 1);
  const journey = roadIndex + throughArchive;
  return journey / (journey + DIFFICULTY_RAMP.halfLife);
}

/** Tiles at a given progress: the saturating climb from min toward max. */
function tilesForProgress(p: number): number {
  const { minTiles, maxTiles } = DIFFICULTY_RAMP;
  return Math.round(minTiles + (maxTiles - minTiles) * p);
}

/**
 * How many boards at the tail of an archive are two-colour planes: none until
 * the road runs deep, then one, then a few, capped -- never the whole archive.
 */
function planeTail(roadIndex: number): number {
  const { planeFromArchive, planeCap } = DIFFICULTY_RAMP;
  if (roadIndex < planeFromArchive) return 0;
  return Math.min(planeCap, roadIndex - planeFromArchive + 1);
}

export interface PuzzleShapeSpec {
  difficulty: Difficulty;
  latticeKind: LatticeKind;
  shape: ShapeName;
  /** Tiles this board aims for, from the ramp rather than the tier default. */
  tileCount: number;
}

/** The parts of a subject that decide its board. */
type BoardChoice = Pick<Subject, 'difficulty' | 'latticeKind' | 'shape'>;

/**
 * A subject's board: its difficulty, lattice, silhouette and size.
 *
 * `roadIndex` is the archive's position along the road, and it is what makes the
 * ramp global -- see `DIFFICULTY_RAMP`. Everything else is derived from position
 * rather than authored, so a blind pack of forty images still yields forty
 * varied, sensibly-ramped boards with nobody having picked any of them. An
 * explicit difficulty, lattice or shape in the pack still wins.
 *
 * Position in the category, not a hash of the id. A hash gives each subject a
 * stable board but says nothing about its neighbours, so across twenty subjects
 * it collides and the same handful of boards keep coming back. Walking the
 * lists, and stepping past any lattice-and-shape pair an earlier board took,
 * guarantees the set is varied. The category offset stops a second category
 * being a re-run of the first.
 */
export function specFor(
  subject: Subject,
  index: number,
  total = 1,
  categoryId = '',
  roadIndex = 0,
): PuzzleShapeSpec {
  const offset = categoryId ? hashString(categoryId) : 0;
  return choose(subject, index, total, roadIndex, offset, takenBefore(index, total, roadIndex, offset));
}

/**
 * The lattice-and-shape pairs the boards before `index` take, assuming they
 * carry no explicit choices of their own. A subject only knows its own
 * overrides; one elsewhere in the pack can at worst make this set inexact, and
 * an inexact set never makes a board collide that would not have anyway.
 */
function takenBefore(index: number, total: number, roadIndex: number, offset: number): Set<string> {
  const taken = new Set<string>();
  for (let j = 0; j < index; j++) {
    const spec = choose({}, j, total, roadIndex, offset, taken);
    if (!isTwoColour(spec.difficulty)) taken.add(`${spec.latticeKind}/${spec.shape}`);
  }
  return taken;
}

function choose(
  subject: BoardChoice,
  index: number,
  total: number,
  roadIndex: number,
  offset: number,
  taken: ReadonlySet<string>,
): PuzzleShapeSpec {
  const p = rampProgress(index, total, roadIndex);
  const authored = subject.difficulty;

  // A plane is the one hard mechanic. The road hands it out only at the tail of
  // its deepest archives; a pack that names its own hard difficulty still gets
  // one. Everything else is a one-colour board, easy near the start and medium
  // after -- which decides only how many anchors are given away for free. The
  // `hard` tier is reserved for planes, so `isTwoColour(difficulty)` downstream
  // still means exactly "this is a plane".
  const plane = authored ? isTwoColour(authored) : index >= total - planeTail(roadIndex);
  const difficulty: Difficulty =
    authored ?? (plane ? 'hard' : p < DIFFICULTY_RAMP.easyUntil ? 'easy' : 'medium');
  const tileCount = authored ? DIFFICULTY_TUNING.tileCount[difficulty] : tilesForProgress(p);

  // A two-colour board is read as rows and columns, so it has to have them: a
  // plain rectangle on a square lattice. A leaf or a ring has no rows. This
  // overrides a pack's own choice rather than deferring to it, because the
  // alternative is a board whose two axes cannot be seen.
  if (plane) {
    return { difficulty, latticeKind: 'square', shape: 'full', tileCount };
  }

  const latticeKind =
    subject.latticeKind ??
    (LATTICE_KINDS[(index + offset) % LATTICE_KINDS.length] as LatticeKind);
  if (subject.shape) return { difficulty, latticeKind, shape: subject.shape, tileCount };

  // The tile count joins the walk position because it decides which silhouettes
  // are legible, and without it two boards of different sizes on the same
  // lattice can walk to the same one -- Andromeda and Saturn both came out as a
  // squircle of triangles.
  const eligible = eligibleShapes(tileCount, latticeKind);
  const from = index * SHAPE_STRIDE + offset + tileCount;

  // The walk's own pick, unless an earlier board on this lattice already has
  // that silhouette; then the next eligible one, and so on round the pool. A
  // pool that is entirely taken keeps the walk's pick: the repeat is then
  // unavoidable, not a mistake. Small opening boards have only `full` to offer,
  // so a couple of plain boards early on is expected, not a fault.
  let shape = pick(eligible, from);
  for (let step = 1; step < eligible.length && taken.has(`${latticeKind}/${shape}`); step++) {
    shape = pick(eligible, from + step);
  }
  return { difficulty, latticeKind, shape, tileCount };
}

/**
 * The shapes that read at this tile count on this lattice.
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
function eligibleShapes(tiles: number, kind: LatticeKind): ShapeName[] {
  return SHAPE_NAMES.filter(
    (s) => tiles >= SHAPE_MIN_TILES[s] && SHAPE_LATTICES[s].includes(kind),
  );
}

function pick(eligible: readonly ShapeName[], from: number): ShapeName {
  if (eligible.length === 0) return 'full';
  return eligible[((from % eligible.length) + eligible.length) % eligible.length] as ShapeName;
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
  roadIndex = 0,
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

  const spec = specFor(subject, index, total, categoryId, roadIndex);
  const puzzle: Puzzle = generatePuzzle({
    id: subject.id,
    anchors,
    difficulty: spec.difficulty,
    latticeKind: spec.latticeKind,
    shape: spec.shape,
    hue: subject.hue,
    targetTiles: spec.tileCount,
    factCount: factCountFor(spec.tileCount, subject.facts.length),
  });

  return { subject, artwork, anchors, palette, puzzle, spec };
}
