import { describe, expect, it } from 'vitest';
import { SAMPLER_CATEGORIES } from '../src/content/sampler/index';
import { specFor } from '../src/game/prepare';
import { SHAPE_MIN_TILES } from '../src/puzzle/shapes';
import { DIFFICULTY_TUNING } from '../src/puzzle/difficulty';
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

  it('never repeats a colour, across categories as well as within one', () => {
    // Fourteen of these twenty images have a dominant hue between 43 and 87
    // degrees, so without assignment almost every board would be the same
    // amber. The hues are assigned over all twenty at once, which is why this
    // checks the flattened list rather than each category separately.
    const hues = ALL.map((s) => s.hue);
    expect(hues.every((h) => h !== undefined)).toBe(true);
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        expect(
          hueDistance(hues[i] as number, hues[j] as number),
          `${ALL[i]!.id} vs ${ALL[j]!.id}`,
        ).toBeGreaterThan(360 / hues.length - 1e-6);
      }
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
    for (const category of SAMPLER_CATEGORIES) {
      const mine = specs.filter((s) => s.category === category.id);
      const pairs = new Set(mine.map((s) => `${s.spec.latticeKind}/${s.spec.shape}`));
      expect(pairs.size, category.id).toBe(mine.length);

      const lattices = new Set(mine.map((s) => s.spec.latticeKind));
      const shapes = new Set(mine.map((s) => s.spec.shape));
      expect(lattices.size, category.id).toBeGreaterThanOrEqual(3);
      expect(shapes.size, category.id).toBeGreaterThanOrEqual(5);
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
