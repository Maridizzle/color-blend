import type { Oklab } from '../color/oklab';
import { type Palette, extractPalette } from '../color/palette';
import { hashString } from '../util/rng';
import {
  type BoardGrid,
  DIFFICULTY_TUNING,
  type Difficulty,
  isTwoColour,
} from '../puzzle/difficulty';
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
 * Two things ramp, and the *form* of the board ramps before its size does:
 *
 *   - Form. The road opens as a straight line of tiles in one colour -- a
 *     value scale, nothing else to read -- then builds into small one-colour
 *     squares, then squares and rectangles in two colours (the plane: hue
 *     across, lightness down), and only after all of that do silhouettes and
 *     the other lattices arrive. Lines, squares, planes, shapes: a new thing
 *     to read is introduced only once the last one is familiar. A board with
 *     a hexagon cut out of triangles was never an easy first puzzle, however
 *     few tiles it had.
 *
 *   - Size. The tile count *saturates*: it climbs quickly at first and then
 *     flattens into a long, gentle plateau it approaches but never reaches.
 *     Tile count alone cannot carry difficulty forever -- eventually a new
 *     mechanic must -- so rather than pretend otherwise it settles at a fair,
 *     playable size and holds there, however deep the road runs.
 *
 * The road has no end -- levels are meant to be added for as long as anyone
 * cares to add them -- so both are built to never run away. Once silhouettes
 * have begun, the plane comes back only as a capstone: the last board or two of
 * the *deepest* archives, never more than a few, so no archive is a wall of
 * them and the newest archive is never the hardest thing in the game.
 */
export const DIFFICULTY_RAMP = {
  /** Tiles on the very first board: a line of five, two of them given. */
  minTiles: 5,
  /**
   * The size one-colour boards climb toward and hold at. Approached, never
   * quite reached, so no board ever runs away as the road lengthens.
   */
  maxTiles: 26,
  /**
   * Journey, in archives, at which the climb from min to max is half done.
   * Small enough that the first archive builds from a line of five into a
   * three-by-three, large enough that it soon flattens into the plateau an
   * endless road needs.
   */
  halfLife: 3,
  /** Below this progress a board hands over a few extra locked anchors. */
  easyUntil: 0.28,
  /** Journey before which a board is a straight line: the first few boards. */
  lineUntil: 0.25,
  /** Journey before which a board is a plain one-colour rectangle: the rest of the first archive. */
  rectangleUntil: 1,
  /** Journey before which a board is a two-colour rectangle: the second and third archives. */
  planeUntil: 3,
  /**
   * The first archive (0-based) whose tail can be a plane again once
   * silhouettes have begun. Two archives of shapes first, so the capstone is
   * a return, not a continuation.
   */
  planeFromArchive: 5,
  /** The most plane boards any one archive ever ends on. */
  planeCap: 3,
} as const;

/**
 * Where a board sits on the road, in archives: the archive's place plus how far
 * through it the board is. Everything about the ramp is a function of this, so
 * it climbs smoothly across the whole road rather than restarting per archive.
 */
function journeyOf(index: number, total: number, roadIndex: number): number {
  // Over `total`, not `total - 1`: an archive's last board still belongs to
  // that archive, and must not land on the next one's threshold.
  const throughArchive = total <= 1 ? 0 : index / total;
  return roadIndex + throughArchive;
}

/** Progress along the road, 0..1, rising fast then flattening toward a plateau it never tops. */
function rampProgress(journey: number): number {
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

/**
 * What kind of thing a board is, in the order the road introduces them.
 *
 *   - `line`: one row of squares, one colour. The first boards.
 *   - `rectangle`: a small plain rectangle of squares, one colour.
 *   - `plane`: a rectangle in two colours, hue across and lightness down.
 *   - `silhouette`: a shape carved from any lattice, one colour -- the general
 *     board, and everything after the opening.
 */
export type BoardForm = 'line' | 'rectangle' | 'plane' | 'silhouette';

/** The form a board takes at a point on the road, before any authored override. */
function formAt(journey: number, index: number, total: number, roadIndex: number): BoardForm {
  const { lineUntil, rectangleUntil, planeUntil } = DIFFICULTY_RAMP;
  if (journey < lineUntil) return 'line';
  if (journey < rectangleUntil) return 'rectangle';
  if (journey < planeUntil) return 'plane';
  return index >= total - planeTail(roadIndex) ? 'plane' : 'silhouette';
}

/** A straight line of tiles, the simplest board there is. Never shorter than three. */
function lineGrid(tiles: number): BoardGrid {
  return { cols: Math.max(3, tiles), rows: 1 };
}

/**
 * The plain rectangle nearest a tile count: two to six on a side, never more
 * than twice as long as it is wide, squarer settling ties. Wide and tall
 * alternate along the road so consecutive boards do not all lie the same way.
 */
function rectangleGrid(tiles: number, index: number): BoardGrid {
  let best: BoardGrid = { cols: 3, rows: 2 };
  let bestScore = Infinity;
  for (let short = 2; short <= 6; short++) {
    for (let long = short; long <= Math.min(6, short * 2); long++) {
      const score = Math.abs(short * long - tiles) + Math.log(long / short) * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = { cols: long, rows: short };
      }
    }
  }
  return index % 2 === 0 ? best : { cols: best.rows, rows: best.cols };
}

/**
 * The plane's grid: three hue columns while the board is small, then the usual
 * four, with lightness rows making up the count. Three columns is a short arc
 * of hue, which is the gentlest way to meet a second axis.
 */
function planeGrid(tiles: number): BoardGrid {
  const cols = tiles < 12 ? 3 : DIFFICULTY_TUNING.planeColumns;
  const rows = Math.max(3, Math.min(12, Math.round(tiles / cols)));
  return { cols, rows };
}

export interface PuzzleShapeSpec {
  difficulty: Difficulty;
  latticeKind: LatticeKind;
  shape: ShapeName;
  /** Tiles this board aims for, from the ramp rather than the tier default. */
  tileCount: number;
  form: BoardForm;
  /** The exact rectangle to build, for every form but a silhouette. */
  grid?: BoardGrid;
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
    if (spec.form === 'silhouette') taken.add(`${spec.latticeKind}/${spec.shape}`);
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
  const journey = journeyOf(index, total, roadIndex);
  const p = rampProgress(journey);
  const authored = subject.difficulty;

  // The road decides the form; a pack's own choices still win. A pack that
  // names its own hard difficulty gets a plane, since the `hard` tier is
  // reserved for planes so that `isTwoColour(difficulty)` downstream still
  // means exactly "this is a plane"; one that names a lattice or a silhouette
  // gets that silhouette. Everything else is a one-colour board, easy near the
  // start and medium after -- which decides only how many anchors are given
  // away for free.
  const form: BoardForm = authored
    ? isTwoColour(authored)
      ? 'plane'
      : 'silhouette'
    : subject.latticeKind || subject.shape
      ? 'silhouette'
      : formAt(journey, index, total, roadIndex);
  const plane = form === 'plane';
  const difficulty: Difficulty =
    authored ?? (plane ? 'hard' : p < DIFFICULTY_RAMP.easyUntil ? 'easy' : 'medium');
  const tileCount = authored ? DIFFICULTY_TUNING.tileCount[difficulty] : tilesForProgress(p);

  // The opening forms are plain rectangles of squares, chosen outright. A
  // two-colour board in particular is read as rows and columns, so it has to
  // have them: a leaf or a ring has no rows. That overrides a pack's own
  // lattice or silhouette rather than deferring to it, because the alternative
  // is a board whose two axes cannot be seen.
  if (form !== 'silhouette') {
    const grid =
      form === 'line'
        ? lineGrid(tileCount)
        : form === 'rectangle'
          ? rectangleGrid(tileCount, index)
          : planeGrid(tileCount);
    return { difficulty, latticeKind: 'square', shape: 'full', tileCount, form, grid };
  }

  const latticeKind =
    subject.latticeKind ??
    (LATTICE_KINDS[(index + offset) % LATTICE_KINDS.length] as LatticeKind);
  if (subject.shape) return { difficulty, latticeKind, shape: subject.shape, tileCount, form };

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
  return { difficulty, latticeKind, shape, tileCount, form };
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
    grid: spec.grid,
    factCount: factCountFor(spec.tileCount, subject.facts.length),
  });

  return { subject, artwork, anchors, palette, puzzle, spec };
}
