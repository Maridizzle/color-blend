import { describe, expect, it } from 'vitest';
import { deltaE, inSrgbGamut } from '../src/color/oklab';
import { extractPalette } from '../src/color/palette';
import {
  type Unconformity,
  acrossUnconformity,
  buildField,
  buildPlaneField,
  axisPosition,
} from '../src/puzzle/field';
import { squareLattice } from '../src/puzzle/lattice';
import { arrangementOf, generatePuzzle } from '../src/puzzle/generator';
import { isSolved } from '../src/puzzle/solve';
import { UNCONFORMITY_TUNING, unconformityFor } from '../src/game/prepare';
import {
  PLACEMENTS_PER_CORE,
  coresAllowedIn,
  coresBanked,
  placementsToNextCore,
} from '../src/game/cores';
import { COOLING_TUNING, heatAfter, heated } from '../src/game/session';
import { bandedImage } from './helpers';

const PALETTE = extractPalette(
  bandedImage([[18, 22, 55], [40, 110, 150], [200, 120, 70], [240, 228, 190]], 160),
);

const GAP: Unconformity = { at: 0.5, width: 0.25 };

/** Lightness by position along the sort axis, dark end first. */
function lightnessAlongAxis(cols: number, rows: number, gap?: Unconformity) {
  const lattice = squareLattice(cols, rows);
  const field = buildField(lattice, PALETTE.anchors, { symmetry: 0, unconformity: gap });
  return lattice.cells
    .map((cell) => ({ t: axisPosition(cell.u, cell.v), L: field[cell.id]!.L }))
    .sort((a, b) => a.t - b.t);
}

describe('the unconformity', () => {
  it('remaps strictly upward, keeps both ends, and jumps by exactly its width', () => {
    // The whole reason it is safe: darkest-to-lightest stays the entire rule.
    expect(acrossUnconformity(0, GAP)).toBe(0);
    expect(acrossUnconformity(1, GAP)).toBeCloseTo(1, 12);
    let last = -1;
    for (let t = 0; t <= 1; t += 0.01) {
      const mapped = acrossUnconformity(t, GAP);
      expect(mapped).toBeGreaterThan(last);
      last = mapped;
    }
    const below = acrossUnconformity(GAP.at - 1e-9, GAP);
    const above = acrossUnconformity(GAP.at, GAP);
    expect(above - below).toBeCloseTo(GAP.width, 6);
    // No gap, no change.
    expect(acrossUnconformity(0.37)).toBe(0.37);
  });

  it('leaves the board monotonic with one step far larger than the rest', () => {
    const plain = lightnessAlongAxis(6, 6);
    const gapped = lightnessAlongAxis(6, 6, GAP);

    const steps: number[] = [];
    for (let i = 1; i < gapped.length; i++) {
      const step = gapped[i]!.L - gapped[i - 1]!.L;
      expect(step).toBeGreaterThanOrEqual(-1e-9);
      if (step > 1e-9) steps.push(step);
    }
    steps.sort((a, b) => a - b);
    const largest = steps[steps.length - 1]!;
    const median = steps[Math.floor(steps.length / 2)]!;
    expect(largest).toBeGreaterThan(median * 3);

    // The ends are untouched: the gap is taken from the middle, not the contrast.
    expect(gapped[0]!.L).toBeCloseTo(plain[0]!.L, 6);
    expect(gapped[gapped.length - 1]!.L).toBeCloseTo(plain[plain.length - 1]!.L, 6);
  });

  it('takes a band of rows out of a two-colour plane and never a band of hue', () => {
    const lattice = squareLattice(4, 8);
    const plain = buildPlaneField(lattice, PALETTE.anchors, { symmetry: 0, hue: 240 });
    const gapped = buildPlaneField(lattice, PALETTE.anchors, {
      symmetry: 0,
      hue: 240,
      unconformity: GAP,
    });
    for (const color of gapped) expect(inSrgbGamut(color)).toBe(true);

    // Lightness still rises monotonically down every column, with one big step.
    const columns = new Map<number, { v: number; L: number }[]>();
    for (const cell of lattice.cells) {
      const key = Math.round(cell.u * 1e4);
      if (!columns.has(key)) columns.set(key, []);
      columns.get(key)!.push({ v: cell.v, L: gapped[cell.id]!.L });
    }
    for (const column of columns.values()) {
      column.sort((a, b) => a.v - b.v);
      for (let i = 1; i < column.length; i++) {
        expect(column[i]!.L).toBeGreaterThanOrEqual(column[i - 1]!.L - 1e-9);
      }
    }
    // The extreme rows are shared with the plain plane; only the middle moved.
    const byCorner = (u: number, v: number) =>
      lattice.cells.reduce((best, c) =>
        Math.hypot(c.u - u, c.v - v) < Math.hypot(best.u - u, best.v - v) ? c : best,
      );
    const top = byCorner(0, 0);
    const bottom = byCorner(0, 1);
    expect(deltaE(gapped[top.id]!, plain[top.id]!)).toBeLessThan(1e-6);
    expect(deltaE(gapped[bottom.id]!, plain[bottom.id]!)).toBeLessThan(1e-6);
  });

  it('is carried by the puzzle and leaves it solvable', () => {
    const puzzle = generatePuzzle({
      id: 'record-test',
      anchors: PALETTE.anchors,
      targetTiles: 20,
      unconformity: GAP,
    });
    expect(puzzle.unconformity).toEqual(GAP);
    const arrangement = arrangementOf(puzzle);
    expect(isSolved(arrangement)).toBe(false);
    // Every tile home is the solved state, gap or no gap.
    const home = { ...arrangement, order: puzzle.lattice.cells.map((c) => c.id) };
    expect(isSolved(home)).toBe(true);
  });
});

describe('deciding which folios carry one', () => {
  const twists = { unconformity: { from: 0, to: 1 } };

  it('never on a collection without the twist, and never when a subject forbids it', () => {
    expect(unconformityFor({ id: 'a' }, 5, 10)).toBeUndefined();
    expect(unconformityFor({ id: 'a', unconformity: false }, 9, 10, twists)).toBeUndefined();
  });

  it('follows the rising chance: none at zero, always at one', () => {
    for (let i = 0; i < 40; i++) {
      expect(unconformityFor({ id: `first-${i}` }, 0, 10, twists)).toBeUndefined();
      expect(unconformityFor({ id: `last-${i}` }, 9, 10, twists)).toBeDefined();
    }
  });

  it('lands between the start and the end, in about the share the chance says', () => {
    const half = { unconformity: { from: 0.5, to: 0.5 } };
    let hits = 0;
    const trials = 400;
    for (let i = 0; i < trials; i++) {
      if (unconformityFor({ id: `mid-${i}` }, 3, 10, half)) hits++;
    }
    expect(hits / trials).toBeGreaterThan(0.4);
    expect(hits / trials).toBeLessThan(0.6);
  });

  it('is the same gap every time a folio is opened, and inside the tuning', () => {
    const a = unconformityFor({ id: 'stable', unconformity: true }, 0, 1)!;
    const b = unconformityFor({ id: 'stable', unconformity: true }, 0, 1)!;
    expect(a).toEqual(b);
    const { minWidth, maxWidth, earliest, latest } = UNCONFORMITY_TUNING;
    expect(a.width).toBeGreaterThanOrEqual(minWidth);
    expect(a.width).toBeLessThan(maxWidth);
    expect(a.at).toBeGreaterThanOrEqual(earliest);
    expect(a.at).toBeLessThan(latest);
  });
});

describe('cooling', () => {
  it('starts hot, ends cold, and only ever falls', () => {
    expect(heatAfter(0)).toBe(1);
    expect(heatAfter(COOLING_TUNING.durationMs)).toBe(0);
    expect(heatAfter(COOLING_TUNING.durationMs * 2)).toBe(0);
    let last = 2;
    for (let ms = 0; ms <= COOLING_TUNING.durationMs; ms += 1000) {
      const heat = heatAfter(ms);
      expect(heat).toBeLessThanOrEqual(last);
      last = heat;
    }
  });

  it('cannot reorder a board: heat lifts every tile by the same lightness', () => {
    const lattice = squareLattice(6, 6);
    const field = buildField(lattice, PALETTE.anchors, { symmetry: 0 });
    for (const heat of [1, 0.5, 0.1]) {
      const hot = field.map((c) => heated(c, heat));
      for (const color of hot) expect(inSrgbGamut(color)).toBe(true);
      // Gamut fitting reduces chroma at fixed lightness, so the offset holds exactly.
      for (let i = 0; i < field.length; i++) {
        expect(hot[i]!.L - field[i]!.L).toBeCloseTo(COOLING_TUNING.lift * heat, 6);
      }
    }
    expect(heated(field[0]!, 0)).toBe(field[0]);
  });
});

describe('core samples', () => {
  it('banks one per twenty placements, less those already drilled', () => {
    expect(coresBanked({ placements: 0, coresSpent: 0 })).toBe(0);
    expect(coresBanked({ placements: PLACEMENTS_PER_CORE - 1, coresSpent: 0 })).toBe(0);
    expect(coresBanked({ placements: PLACEMENTS_PER_CORE, coresSpent: 0 })).toBe(1);
    expect(coresBanked({ placements: PLACEMENTS_PER_CORE * 3 + 5, coresSpent: 2 })).toBe(1);
    // Never negative, whatever an old record says.
    expect(coresBanked({ placements: 5, coresSpent: 9 })).toBe(0);
  });

  it('counts down to the next core', () => {
    expect(placementsToNextCore({ placements: 0 })).toBe(PLACEMENTS_PER_CORE);
    expect(placementsToNextCore({ placements: 7 })).toBe(PLACEMENTS_PER_CORE - 7);
    expect(placementsToNextCore({ placements: PLACEMENTS_PER_CORE })).toBe(PLACEMENTS_PER_CORE);
  });

  it('is allowed on the carrier, and everywhere only once the carrier is whole', () => {
    const subject = (id: string) => ({ id });
    const record = {
      id: 'the-record',
      subjects: [subject('r1'), subject('r2')],
      twists: { cores: true },
    };
    const cosmos = { id: 'cosmos', subjects: [subject('c1')] };
    const all = [cosmos, record] as unknown as Parameters<typeof coresAllowedIn>[1];

    const none = { solved: {} };
    expect(coresAllowedIn(record, all, none)).toBe(true);
    expect(coresAllowedIn(cosmos, all, none)).toBe(false);

    const half = { solved: { r1: { moves: 1, at: 0 } } };
    expect(coresAllowedIn(cosmos, all, half)).toBe(false);

    const whole = { solved: { r1: { moves: 1, at: 0 }, r2: { moves: 1, at: 0 } } };
    expect(coresAllowedIn(cosmos, all, whole)).toBe(true);

    // A game with no carrier has no cores at all.
    expect(coresAllowedIn(cosmos, [cosmos] as unknown as typeof all, whole)).toBe(false);
  });
});
