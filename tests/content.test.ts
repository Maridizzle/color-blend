import { describe, expect, it } from 'vitest';
import { SAMPLER_CATEGORIES } from '../src/content/sampler/index';
import { specFor } from '../src/game/prepare';
import { SHAPE_MIN_TILES } from '../src/puzzle/shapes';
import { DIFFICULTY_TUNING, isTwoColour } from '../src/puzzle/difficulty';
import { hueDistance } from '../src/content/hues';
import type { Subject } from '../src/content/types';

const ALL: Subject[] = SAMPLER_CATEGORIES.flatMap((c) => c.subjects);

describe('shipped content', () => {
  it('gives every subject a title, a blurb, artwork and facts', () => {
    for (const s of ALL) {
      expect(s.title, s.id).toBeTruthy();
      expect(s.blurb, s.id).toBeTruthy();
      expect(s.facts.length, s.id).toBeGreaterThanOrEqual(4);
      expect(s.artwork.kind, s.id).toBe('url');
    }
  });

  it('has unique ids', () => {
    expect(new Set(ALL.map((s) => s.id)).size).toBe(ALL.length);
  });

  it('never repeats a colour within a category', () => {
    // Most of these images have a dominant hue between 43 and 87 degrees, so
    // without assignment almost every board would be the same amber.
    //
    // Checked per category rather than over the flattened list, because that is
    // where the assignment now runs. All 27 on one wheel would sit 13 degrees
    // apart, which nobody can tell apart; per category they get 33, 40 and 51.
    // A hue may therefore recur between categories -- never within a list you
    // are looking at, which is the only place it would read as a repeat.
    expect(ALL.every((s) => s.hue !== undefined)).toBe(true);
    for (const category of SAMPLER_CATEGORIES) {
      const hues = category.subjects.map((s) => s.hue as number);
      // The slots are 360/n apart exactly; the values here are whole degrees so
      // a pair can land a degree short of that. Keeping them integers is worth
      // more than the degree -- they are read and edited by hand.
      const spacing = 360 / hues.length - 1;
      for (let i = 0; i < hues.length; i++) {
        for (let j = i + 1; j < hues.length; j++) {
          expect(
            hueDistance(hues[i] as number, hues[j] as number),
            `${category.id}: ${category.subjects[i]!.id} vs ${category.subjects[j]!.id}`,
          ).toBeGreaterThan(spacing);
        }
      }
    }
  });

  it('spaces a category’s colours further apart than one global pass could', () => {
    // The reason for the change, pinned so it cannot quietly regress to a single
    // wheel shared by every subject in the game.
    const global = 360 / ALL.length;
    for (const category of SAMPLER_CATEGORIES) {
      expect(360 / category.subjects.length, category.id).toBeGreaterThan(global);
    }
  });
});

describe('board assignment across a category', () => {
  const specs = SAMPLER_CATEGORIES.flatMap((c) =>
    c.subjects.map((s, i) => ({
      id: s.id,
      category: c.id,
      spec: specFor(s, i, c.subjects.length, c.id),
    })),
  );

  it('only ever picks a shape the board is big enough to read as', () => {
    for (const { id, spec } of specs) {
      const tiles = DIFFICULTY_TUNING.tileCount[spec.difficulty];
      expect(tiles, `${id} (${spec.shape})`).toBeGreaterThanOrEqual(
        SHAPE_MIN_TILES[spec.shape],
      );
    }
  });

  it('varies the boards rather than repeating a handful', () => {
    // The property that matters once a category is longer than a few puzzles.
    // A hash of the subject id gives each board stability and says nothing
    // about its neighbours, so it collided; walking by position does not.
    //
    // Two-colour boards are excluded because they are all deliberately the same
    // shape: a plane has to have rows and columns to be read as two axes, so it
    // is always a plain rectangle. That is a real cost of the hard tier and it
    // is recorded in `isTwoColour`, not something to paper over here.
    for (const category of SAMPLER_CATEGORIES) {
      const mine = specs.filter(
        (s) => s.category === category.id && !isTwoColour(s.spec.difficulty),
      );
      const pairs = new Set(mine.map((s) => `${s.spec.latticeKind}/${s.spec.shape}`));
      expect(pairs.size, category.id).toBe(mine.length);

      // Variety has to scale with the category, because a fixed floor is not a
      // property of the assignment -- it is a statement about how many subjects
      // happen to be shipped. Five subjects cannot show four shapes and three
      // lattices without repeating a pair, which the line above already forbids.
      const lattices = new Set(mine.map((s) => s.spec.latticeKind));
      const shapes = new Set(mine.map((s) => s.spec.shape));
      expect(lattices.size, category.id).toBeGreaterThanOrEqual(Math.min(3, mine.length));
      expect(shapes.size, category.id).toBeGreaterThanOrEqual(Math.min(4, Math.ceil(mine.length / 2)));

      // And no shape may dominate, at any category size. This is the property
      // the fixed floor was reaching for, and it does not weaken with a small
      // category the way a count does.
      const commonest = Math.max(...[...shapes].map((sh) => mine.filter((m) => m.spec.shape === sh).length));
      expect(commonest, `${category.id}: one shape on ${commonest} of ${mine.length} boards`).toBeLessThanOrEqual(
        Math.ceil(mine.length / 2),
      );
    }
  });

  it('never repeats a lattice-and-shape pair in a blind pack of ordinary size', () => {
    // A pack loaded from a zip has no author to vary its boards, and a shipped
    // archive should not need one either: The Elements, at seven, had two
    // hexagons on the triangle lattice before the assignment learned to step
    // past a pair already taken. Sizes up to sixteen keep every tier inside a
    // pool wide enough that a repeat is always avoidable.
    const ids = ['a', 'pack-1', 'the-elements', 'wonder', 'zeta', 'periodic-table-2'];
    for (const id of ids) {
      for (let total = 1; total <= 16; total++) {
        const boards = Array.from({ length: total }, (_, i) =>
          specFor({ id: `${id}-${i}` } as unknown as Subject, i, total, id),
        ).filter((spec) => !isTwoColour(spec.difficulty));
        const pairs = new Set(boards.map((spec) => `${spec.latticeKind}/${spec.shape}`));
        expect(pairs.size, `${id} × ${total}`).toBe(boards.length);
      }
    }
  });

  it('makes every two-colour board a plain rectangle on a square lattice', () => {
    const planes = specs.filter((s) => isTwoColour(s.spec.difficulty));
    expect(planes.length).toBeGreaterThan(0);
    for (const { id, spec } of planes) {
      expect(spec.latticeKind, id).toBe('square');
      expect(spec.shape, id).toBe('full');
    }
  });

  it('does not make a second category a re-run of the first', () => {
    // Without the category offset every category opens with the same square
    // grid and then the same hexagon, in the same order.
    const [first, second] = SAMPLER_CATEGORIES;
    const key = (c: typeof first) =>
      c!.subjects
        .map((s, i) => {
          const spec = specFor(s, i, c!.subjects.length, c!.id);
          return `${spec.latticeKind}/${spec.shape}`;
        })
        .join(',');
    expect(key(first)).not.toBe(key(second));
  });

  it('ramps difficulty by how far through the category a subject is', () => {
    for (const category of SAMPLER_CATEGORIES) {
      const mine = specs.filter((s) => s.category === category.id);
      expect(mine[0]!.spec.difficulty).toBe('easy');
      expect(mine[mine.length - 1]!.spec.difficulty).toBe('hard');
      // And it only ever goes up.
      const rank = { easy: 0, medium: 1, hard: 2 };
      for (let i = 1; i < mine.length; i++) {
        expect(rank[mine[i]!.spec.difficulty]).toBeGreaterThanOrEqual(
          rank[mine[i - 1]!.spec.difficulty],
        );
      }
    }
  });
});
