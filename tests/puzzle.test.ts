import { describe, expect, it } from 'vitest';
import { type Oklab, deltaE, inSrgbGamut, rgbToOklab } from '../src/color/oklab';
import { extractPalette } from '../src/color/palette';
import {
  type Lattice,
  diamondLattice,
  hexLattice,
  type LatticeKind,
  makeLattice,
  maskLattice,
  squareLattice,
  triangleLattice,
} from '../src/puzzle/lattice';
import { SHAPES, SHAPE_NAMES, type ShapeName } from '../src/puzzle/shapes';
import { buildField, cornersFromAnchors, fieldStats, orientUv, sampleCorners } from '../src/puzzle/field';
import { DIFFICULTY_TUNING, buildBoard, calibrate, type Difficulty } from '../src/puzzle/difficulty';
import { arrangementOf, generatePuzzle } from '../src/puzzle/generator';
import {
  colorAt,
  countCorrect,
  findHintSwap,
  isCellCorrect,
  isSolved,
  swap,
} from '../src/puzzle/solve';
import { bandedImage } from './helpers';

const PALETTE = extractPalette(
  bandedImage(
    [
      [18, 22, 55],
      [40, 110, 150],
      [200, 120, 70],
      [240, 228, 190],
    ],
    160,
  ),
);

function expectValidLattice(l: Lattice) {
  expect(l.cells.length).toBeGreaterThan(0);
  expect(l.width).toBeGreaterThan(0);
  expect(l.height).toBeGreaterThan(0);

  l.cells.forEach((cell, i) => {
    expect(cell.id).toBe(i);
    expect(cell.poly.length).toBeGreaterThanOrEqual(3);
    expect(cell.u).toBeGreaterThanOrEqual(0);
    expect(cell.u).toBeLessThanOrEqual(1);
    expect(cell.v).toBeGreaterThanOrEqual(0);
    expect(cell.v).toBeLessThanOrEqual(1);
    expect(new Set(cell.neighbors).size).toBe(cell.neighbors.length);
    expect(cell.neighbors).not.toContain(cell.id);
  });

  // Adjacency must be mutual, or hint/keyboard navigation walks off a cliff.
  for (const cell of l.cells) {
    for (const n of cell.neighbors) {
      expect(l.cells[n]!.neighbors).toContain(cell.id);
    }
  }
}

describe('lattices', () => {
  it('builds a valid square lattice', () => {
    const l = squareLattice(6, 4);
    expectValidLattice(l);
    expect(l.cells.length).toBe(24);
    expect(l.cells[0]!.neighbors.length).toBe(2); // corner
    // Interior cells of a square grid have exactly four neighbours.
    const interior = l.cells.find((c) => c.neighbors.length === 4);
    expect(interior).toBeDefined();
  });

  it('builds a valid hex lattice with up to six neighbors', () => {
    const l = hexLattice(6, 6);
    expectValidLattice(l);
    expect(Math.max(...l.cells.map((c) => c.neighbors.length))).toBe(6);
  });

  it('builds a valid triangle lattice with up to three neighbors', () => {
    const l = triangleLattice(9, 5);
    expectValidLattice(l);
    expect(Math.max(...l.cells.map((c) => c.neighbors.length))).toBe(3);
  });

  it('builds a valid diamond lattice with up to four neighbors', () => {
    const l = diamondLattice(6, 8);
    expectValidLattice(l);
    expect(Math.max(...l.cells.map((c) => c.neighbors.length))).toBe(4);
  });

  it('spans the full normalized range on every kind', () => {
    for (const kind of ['square', 'hex', 'triangle', 'diamond'] as const) {
      const l = makeLattice(kind, 8, 8);
      expect(Math.min(...l.cells.map((c) => c.u))).toBeLessThan(0.15);
      expect(Math.max(...l.cells.map((c) => c.u))).toBeGreaterThan(0.85);
      expect(Math.min(...l.cells.map((c) => c.v))).toBeLessThan(0.15);
      expect(Math.max(...l.cells.map((c) => c.v))).toBeGreaterThan(0.85);
    }
  });
});

describe('shape masks', () => {
  it('produces a smaller, still-valid, still-connected lattice', () => {
    const base = squareLattice(14, 14);
    for (const name of SHAPE_NAMES) {
      const masked = maskLattice(base, SHAPES[name]);
      expectValidLattice(masked);
      if (name === 'full') {
        expect(masked.cells.length).toBe(base.cells.length);
      } else {
        expect(masked.cells.length).toBeLessThan(base.cells.length);
        expect(masked.cells.length).toBeGreaterThan(20);
      }
      // No orphans: every cell can reach the board.
      expect(masked.cells.every((c) => c.neighbors.length > 0)).toBe(true);
    }
  });

  it('carves a circle that excludes the corners but keeps the middle', () => {
    const masked = maskLattice(squareLattice(16, 16), SHAPES.circle);
    const area = masked.cells.length / 256;
    expect(area).toBeGreaterThan(0.68); // pi/4 ~= 0.785, minus edge effects
    expect(area).toBeLessThan(0.85);
  });
});

describe('gradient field', () => {
  it('puts the darkest and lightest anchors on opposite corners', () => {
    const corners = cornersFromAnchors(PALETTE.anchors);
    const dark = PALETTE.anchors[0]!;
    const light = PALETTE.anchors[PALETTE.anchors.length - 1]!;
    expect(deltaE(corners[0], dark)).toBeLessThan(1e-9);
    expect(deltaE(corners[2], light)).toBeLessThan(1e-9);
  });

  it('interpolates linearly, not in an S-curve', () => {
    // The reason for bilinear over inverse-distance weighting: an even spread of
    // shades across the board. Quarter of the way along the diagonal should be
    // about a quarter of the way along the color ramp.
    const dark = rgbToOklab({ r: 0, g: 0, b: 0 });
    const light = rgbToOklab({ r: 255, g: 255, b: 255 });
    const corners = cornersFromAnchors([dark, light]);
    const quarter = sampleCorners(corners, 0.25, 0.25);
    const half = sampleCorners(corners, 0.5, 0.5);
    const threeQuarter = sampleCorners(corners, 0.75, 0.75);

    const total = deltaE(dark, light);
    expect(deltaE(dark, quarter) / total).toBeCloseTo(0.25, 2);
    expect(deltaE(dark, half) / total).toBeCloseTo(0.5, 2);
    expect(deltaE(dark, threeQuarter) / total).toBeCloseTo(0.75, 2);
  });

  it('produces only in-gamut colors', () => {
    const lattice = squareLattice(10, 10);
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      for (const color of buildField(lattice, PALETTE.anchors, { symmetry })) {
        expect(inSrgbGamut(color, 1e-3)).toBe(true);
      }
    }
  });

  it('orients the gradient differently per symmetry but keeps the same colors', () => {
    const lattice = squareLattice(8, 8);
    const seen = new Set<string>();
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const field = buildField(lattice, PALETTE.anchors, { symmetry });
      const darkestCell = field.reduce(
        (best, c, i) => (c.L < (field[best] as { L: number }).L ? i : best),
        0,
      );
      seen.add(`${lattice.cells[darkestCell]!.u.toFixed(2)},${lattice.cells[darkestCell]!.v.toFixed(2)}`);
    }
    // Four distinct corners are reachable; transposition duplicates them.
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('inverts orientation consistently', () => {
    for (let s = 0; s < 8; s++) {
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [0.25, 0.75],
      ] as const) {
        const [ou, ov] = orientUv(u, v, s);
        // Applying flips then transpose must undo transpose then flips.
        let x = ou;
        let y = ov;
        if (s & 1) x = 1 - x;
        if (s & 2) y = 1 - y;
        if (s & 4) [x, y] = [y, x];
        expect(x).toBeCloseTo(u, 9);
        expect(y).toBeCloseTo(v, 9);
      }
    }
  });

  it('reports a neighbor step that shrinks as the board grows', () => {
    const coarse = fieldStats(squareLattice(6, 6), buildField(squareLattice(6, 6), PALETTE.anchors));
    const fine = fieldStats(squareLattice(18, 18), buildField(squareLattice(18, 18), PALETTE.anchors));
    expect(fine.medianMaxNeighborDeltaE).toBeLessThan(coarse.medianMaxNeighborDeltaE);
    // A coarse board samples cell *centers*, so it never quite reaches the
    // corner anchors; a finer board gets closer and so shows a wider range.
    expect(fine.range).toBeGreaterThanOrEqual(coarse.range);
  });
});

describe('difficulty calibration', () => {
  it('hits the perceptual target it aims for', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const result = calibrate(PALETTE.anchors, 'square', 'full', difficulty, 0);
      const target = DIFFICULTY_TUNING.targetNeighborDeltaE[difficulty];
      // Dimension is an integer, so allow a generous band around the target.
      expect(result.measuredNeighborDeltaE).toBeGreaterThan(target * 0.6);
      expect(result.measuredNeighborDeltaE).toBeLessThan(target * 1.6);
    }
  });

  it('gives a harder difficulty more tiles', () => {
    const easy = calibrate(PALETTE.anchors, 'square', 'full', 'easy', 0);
    const hard = calibrate(PALETTE.anchors, 'square', 'full', 'hard', 0);
    expect(hard.lattice.cells.length).toBeGreaterThan(easy.lattice.cells.length);
  });

  it('gives a low-contrast palette fewer tiles than a vivid one', () => {
    // This is the whole point of calibration: a washed-out blind image must not
    // become an unreadable pixel hunt.
    const vivid = extractPalette(
      bandedImage(
        [
          [5, 5, 20],
          [220, 40, 40],
          [250, 250, 240],
        ],
        160,
      ),
    );
    const washed = extractPalette(
      bandedImage(
        [
          [110, 116, 128],
          [150, 154, 164],
          [178, 182, 190],
        ],
        160,
      ),
    );
    expect(washed.spread).toBeLessThan(vivid.spread);

    const vividBoard = calibrate(vivid.anchors, 'square', 'full', 'medium', 0);
    const washedBoard = calibrate(washed.anchors, 'square', 'full', 'medium', 0);
    expect(washedBoard.lattice.cells.length).toBeLessThan(vividBoard.lattice.cells.length);
  });

  it('respects the tile ceiling on every lattice kind and shape', () => {
    for (const kind of ['square', 'hex', 'triangle', 'diamond'] as const) {
      const board = buildBoard(kind, 'full', DIFFICULTY_TUNING.maxDimension);
      const calibrated = calibrate(PALETTE.anchors, kind, 'full', 'hard', 0);
      expect(calibrated.lattice.cells.length).toBeLessThanOrEqual(DIFFICULTY_TUNING.maxTiles);
      expect(board.cells.length).toBeGreaterThan(0);
    }
  });
});

describe('puzzle generation', () => {
  const make = (overrides = {}) =>
    generatePuzzle({ id: 'test-subject', anchors: PALETTE.anchors, factCount: 4, ...overrides });

  it('starts unsolved and mostly incorrect', () => {
    const puzzle = make();
    const arrangement = arrangementOf(puzzle);
    expect(isSolved(arrangement)).toBe(false);

    const movable = puzzle.locked.filter((l) => !l).length;
    const lockedCount = puzzle.locked.filter(Boolean).length;
    const correctMovable = countCorrect(arrangement) - lockedCount;
    expect(correctMovable / movable).toBeLessThanOrEqual(0.2);
  });

  it('is solved once every tile is back home', () => {
    const puzzle = make();
    const solvedOrder = puzzle.lattice.cells.map((c) => c.id);
    expect(isSolved({ ...arrangementOf(puzzle), order: solvedOrder })).toBe(true);
  });

  it('locks the promised number of starters, and locks them correct', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const puzzle = make({ difficulty });
      const lockedIds = puzzle.locked.flatMap((l, i) => (l ? [i] : []));
      expect(lockedIds.length).toBe(DIFFICULTY_TUNING.lockedStarters[difficulty]);
      const arrangement = arrangementOf(puzzle);
      for (const id of lockedIds) expect(isCellCorrect(arrangement, id)).toBe(true);
    }
  });

  it('locks a starter holding the darkest shade, so the sort has an origin', () => {
    const puzzle = make({ difficulty: 'easy' });
    const arrangement = arrangementOf(puzzle);
    const darkest = Math.min(...puzzle.targets.map((t) => t.L));
    const lockedLightness = puzzle.locked.flatMap((l, i) => (l ? [colorAt(arrangement, i).L] : []));
    expect(Math.min(...lockedLightness)).toBeCloseTo(darkest, 2);
  });

  it('places fact tiles on movable cells and spreads them out', () => {
    const puzzle = make({ factCount: 4, difficulty: 'easy' });
    expect(puzzle.factCells.length).toBe(4);
    expect(new Set(puzzle.factCells).size).toBe(4);
    for (const id of puzzle.factCells) expect(puzzle.locked[id]).toBe(false);

    // Spread means no two fact tiles are immediate neighbours.
    for (const id of puzzle.factCells) {
      const neighbors = puzzle.lattice.cells[id]!.neighbors;
      expect(puzzle.factCells.some((other) => neighbors.includes(other))).toBe(false);
    }
  });

  it('is reproducible from its seed and varies without one', () => {
    const a = generatePuzzle({ id: 'x', anchors: PALETTE.anchors, seed: 42 });
    const b = generatePuzzle({ id: 'x', anchors: PALETTE.anchors, seed: 42 });
    const c = generatePuzzle({ id: 'x', anchors: PALETTE.anchors, seed: 43 });
    expect(a.order).toEqual(b.order);
    expect(a.order).not.toEqual(c.order);
  });

  it('works across every lattice kind and shape', () => {
    for (const latticeKind of ['square', 'hex', 'triangle', 'diamond'] as const) {
      for (const shape of SHAPE_NAMES) {
        const puzzle = generatePuzzle({
          id: `${latticeKind}-${shape}`,
          anchors: PALETTE.anchors,
          latticeKind,
          shape,
          factCount: 3,
        });
        expect(puzzle.lattice.cells.length).toBeGreaterThan(10);
        expect(isSolved(arrangementOf(puzzle))).toBe(false);
      }
    }
  });

  it('refuses to build from a single shade', () => {
    expect(() => generatePuzzle({ id: 'flat', anchors: [PALETTE.anchors[0]!] })).toThrow(
      /at least 2 anchor colors/,
    );
  });
});

describe('correctness and hints', () => {
  it('treats identical shades as interchangeable', () => {
    // Wherever the gradient repeats a color, swapping those two tiles must keep
    // the board correct -- otherwise the player is hunting an invisible
    // difference. A two-anchor palette is where this really bites, since every
    // color then lies on one line in Oklab and whole bands come out identical.
    const twoAnchors = [rgbToOklab({ r: 12, g: 14, b: 40 }), rgbToOklab({ r: 235, g: 238, b: 250 })];
    const puzzle = generatePuzzle({ id: 'dup', anchors: twoAnchors, seed: 3 });
    const order = puzzle.lattice.cells.map((c) => c.id);
    const arrangement = { ...arrangementOf(puzzle), order };
    expect(isSolved(arrangement)).toBe(true);

    let found = false;
    for (let i = 0; i < puzzle.targets.length && !found; i++) {
      for (let j = i + 1; j < puzzle.targets.length; j++) {
        if (deltaE(puzzle.targets[i]!, puzzle.targets[j]!) <= puzzle.tolerance) {
          swap(order, i, j);
          expect(isSolved(arrangement)).toBe(true);
          swap(order, i, j);
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('prefers three anchors over two when the image has a third real shade', () => {
    // A sky-and-sand photo has two dominant shades and a minor third; taking
    // only the two would flatten the board into stripes.
    const palette = extractPalette(
      bandedImage(
        [
          [70, 120, 200],
          [70, 120, 200],
          [70, 120, 200],
          [225, 205, 160],
          [225, 205, 160],
          [225, 205, 160],
          [40, 90, 60],
        ],
        160,
      ),
    );
    expect(palette.anchors.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects a swap between visibly different cells', () => {
    const puzzle = generatePuzzle({ id: 'diff', anchors: PALETTE.anchors, seed: 5 });
    const order = puzzle.lattice.cells.map((c) => c.id);
    const arrangement = { ...arrangementOf(puzzle), order };

    const darkest = puzzle.targets.reduce((b, t, i) => (t.L < puzzle.targets[b]!.L ? i : b), 0);
    const lightest = puzzle.targets.reduce((b, t, i) => (t.L > puzzle.targets[b]!.L ? i : b), 0);
    swap(order, darkest, lightest);
    expect(isSolved(arrangement)).toBe(false);
  });

  it('hints a swap that makes progress, and solves the board when followed', () => {
    const puzzle = generatePuzzle({ id: 'hintable', anchors: PALETTE.anchors, seed: 11 });
    const arrangement = arrangementOf(puzzle);

    let guard = 0;
    const limit = puzzle.lattice.cells.length * 4;
    while (!isSolved(arrangement) && guard++ < limit) {
      const hint = findHintSwap(arrangement, puzzle.locked);
      expect(hint).not.toBeNull();
      const before = countCorrect(arrangement);
      swap(puzzle.order, hint!.from, hint!.to);
      expect(countCorrect(arrangement)).toBeGreaterThan(before);
    }
    expect(isSolved(arrangement)).toBe(true);
    expect(findHintSwap(arrangement, puzzle.locked)).toBeNull();
  });

  it('never hints a swap that undoes progress, and always terminates', () => {
    // The failure this guards against: a hint that lifts a tile out of an
    // already-correct cell nets zero, so repeated hints cycle forever instead
    // of solving. Coarse boards with many repeated shades are where it shows
    // up, so sweep difficulties, lattices and shapes rather than one case.
    const twoAnchor = [rgbToOklab({ r: 20, g: 30, b: 70 }), rgbToOklab({ r: 240, g: 235, b: 220 })];

    // Each case is a full solve, so sweep the dimensions that matter rather
    // than their whole cross product: anchor count (two anchors means many
    // interchangeable shades), difficulty, lattice, and masking.
    const cases: { anchors: readonly Oklab[]; difficulty: Difficulty; latticeKind: LatticeKind; shape: ShapeName }[] = [];
    for (const anchors of [PALETTE.anchors, twoAnchor]) {
      for (const difficulty of ['easy', 'medium'] as const) {
        for (const latticeKind of ['square', 'hex', 'triangle', 'diamond'] as const) {
          cases.push({ anchors, difficulty, latticeKind, shape: 'full' });
        }
      }
      for (const shape of ['circle', 'leaf', 'arch'] as const) {
        cases.push({ anchors, difficulty: 'medium', latticeKind: 'hex', shape });
      }
      cases.push({ anchors, difficulty: 'hard', latticeKind: 'square', shape: 'full' });
    }

    for (const testCase of cases) {
      const puzzle = generatePuzzle({
        id: `${testCase.difficulty}-${testCase.latticeKind}-${testCase.shape}`,
        ...testCase,
      });
      const arrangement = arrangementOf(puzzle);
      const label = `${testCase.anchors.length}-anchor ${puzzle.id}`;

      let steps = 0;
      // Two hints per cell bounds it: every hint either raises the correct
      // count, which can happen at most once per cell, or seats one more tile
      // in its own home cell, likewise at most once per cell.
      const limit = puzzle.lattice.cells.length * 2 + 4;
      while (!isSolved(arrangement) && steps++ < limit) {
        const hint = findHintSwap(arrangement, puzzle.locked);
        expect(hint, `no hint for ${label}`).not.toBeNull();

        const before = countCorrect(arrangement);
        swap(puzzle.order, hint!.from, hint!.to);
        expect(countCorrect(arrangement), `hint went backwards on ${label}`).toBeGreaterThanOrEqual(
          before,
        );
      }
      expect(isSolved(arrangement), `${label} did not solve in ${limit} hints`).toBe(true);
    }
  });
});
