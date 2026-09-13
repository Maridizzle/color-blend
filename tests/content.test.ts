import { describe, expect, it } from 'vitest';
import { SAMPLER_CATEGORIES } from '../src/content/sampler/index';
import { specFor, DIFFICULTY_RAMP } from '../src/game/prepare';
import { SHAPE_MIN_TILES } from '../src/puzzle/shapes';
import { isTwoColour } from '../src/puzzle/difficulty';
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
  // roadIndex is the archive's place on the road: it drives the global
  // difficulty ramp, so the tests build it exactly as the app does.
  const specs = SAMPLER_CATEGORIES.flatMap((c, roadIndex) =>
    c.subjects.map((s, i) => ({
      id: s.id,
      category: c.id,
      roadIndex,
      spec: specFor(s, i, c.subjects.length, c.id, roadIndex),
    })),
  );

  it('only ever picks a shape the board is big enough to read as', () => {
    for (const { id, spec } of specs) {
      expect(spec.tileCount, `${id} (${spec.shape})`).toBeGreaterThanOrEqual(
        SHAPE_MIN_TILES[spec.shape],
      );
    }
  });

  it('varies the boards rather than repeating a handful', () => {
    // The property that matters once a category is longer than a few puzzles.
    // A hash of the subject id gives each board stability and says nothing
    // about its neighbours, so it collided; walking by position does not.
    //
    // Only silhouettes count. The road's opening forms -- lines, rectangles and
    // two-colour planes -- are all deliberately plain rectangles of squares: a
    // plane has to have rows and columns to be read as two axes, and a line is
    // a line. Variety is a property of the shaped boards that follow them.
    for (const category of SAMPLER_CATEGORIES) {
      const mine = specs.filter(
        (s) => s.category === category.id && s.spec.form === 'silhouette',
      );
      if (mine.length < 2) continue;
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
    // pool wide enough that a repeat is always avoidable. A pack plays at the
    // road's first archive of shapes, as the app places it.
    const ids = ['a', 'pack-1', 'the-elements', 'wonder', 'zeta', 'periodic-table-2'];
    for (const id of ids) {
      for (let total = 1; total <= 16; total++) {
        const boards = Array.from({ length: total }, (_, i) =>
          specFor({ id: `${id}-${i}` } as unknown as Subject, i, total, id, DIFFICULTY_RAMP.planeUntil),
        ).filter((spec) => spec.form === 'silhouette');
        expect(boards.length, `${id} × ${total} is all shapes`).toBe(total);
        const pairs = new Set(boards.map((spec) => `${spec.latticeKind}/${spec.shape}`));
        expect(pairs.size, `${id} × ${total}`).toBe(boards.length);
      }
    }
  });

  it('does not make a second category a re-run of the first', () => {
    // Without the category offset every category opens with the same square
    // grid and then the same hexagon, in the same order.
    const [first, second] = SAMPLER_CATEGORIES;
    const key = (c: typeof first) =>
      c!.subjects
        .map((s, i) => {
          const spec = specFor(s, i, c!.subjects.length, c!.id, DIFFICULTY_RAMP.planeUntil);
          return `${spec.latticeKind}/${spec.shape}`;
        })
        .join(',');
    expect(key(first)).not.toBe(key(second));
  });

  it('ramps difficulty along the whole road, gently at the start and never runs away', () => {
    // The journey is the archives in road order, concatenated: the difficulty
    // ramp runs across all of them, not within each one.
    const journey = specs; // already in road order

    // The very first board is the easiest thing the game has: easy tier, the
    // smallest tile count, and one colour.
    const first = journey[0]!.spec;
    expect(first.difficulty).toBe('easy');
    expect(first.tileCount).toBe(DIFFICULTY_RAMP.minTiles);
    expect(isTwoColour(first.difficulty)).toBe(false);

    // The tile count only ever climbs across the road, and never past the
    // plateau -- the saturating curve is what lets the road grow without end.
    for (let i = 1; i < journey.length; i++) {
      expect(journey[i]!.spec.tileCount).toBeGreaterThanOrEqual(journey[i - 1]!.spec.tileCount);
    }
    for (const { id, spec } of journey) {
      expect(spec.tileCount, id).toBeLessThanOrEqual(DIFFICULTY_RAMP.maxTiles);
    }
  });

  it('opens with straight lines in one colour, then builds into squares', () => {
    // The first archive is the lesson: a line of five, two of them given, then
    // longer lines, then small plain rectangles growing to a three-by-three.
    // Nothing shaped, nothing two-coloured, nothing big.
    const cosmos = specs.filter((s) => s.roadIndex === 0);
    expect(cosmos.length).toBeGreaterThan(3);

    const first = cosmos[0]!.spec;
    expect(first.form).toBe('line');
    expect(first.grid).toEqual({ cols: DIFFICULTY_RAMP.minTiles, rows: 1 });
    expect(first.difficulty).toBe('easy');

    const forms = cosmos.map((s) => s.spec.form);
    const lines = forms.filter((f) => f === 'line').length;
    expect(lines).toBeGreaterThanOrEqual(2);
    expect(forms.slice(0, lines).every((f) => f === 'line')).toBe(true);
    expect(forms.slice(lines).every((f) => f === 'rectangle')).toBe(true);

    for (const { id, spec } of cosmos) {
      expect(isTwoColour(spec.difficulty), `${id} is a plane in the first archive`).toBe(false);
      expect(spec.latticeKind, id).toBe('square');
      expect(spec.shape, id).toBe('full');
      expect(spec.tileCount, id).toBeLessThanOrEqual(10);
      if (spec.form === 'line') expect(spec.grid?.rows, id).toBe(1);
    }
    // It ends on a square, not a strip.
    expect(cosmos[cosmos.length - 1]!.spec.grid).toEqual({ cols: 3, rows: 3 });
  });

  it('introduces one thing at a time: lines, squares, two colours, then shapes', () => {
    // Along the road the form only ever moves forward through that order. The
    // one exception is the plane returning as a capstone at the tail of a deep
    // archive, which is allowed only there.
    const order: Record<string, number> = { line: 0, rectangle: 1, plane: 2, silhouette: 3 };
    let reached = 0;
    for (const { id, spec, roadIndex } of specs) {
      const rank = order[spec.form]!;
      if (rank < reached) {
        expect(spec.form, `${id} steps back to a ${spec.form}`).toBe('plane');
        expect(roadIndex, `${id} is a plane before the road runs deep`).toBeGreaterThanOrEqual(
          DIFFICULTY_RAMP.planeFromArchive,
        );
      } else {
        reached = rank;
      }
    }
    expect(reached, 'the road reaches shapes').toBe(3);

    // The second and third archives are the two-colour rectangles, entire.
    for (const { id, spec, roadIndex } of specs) {
      if (roadIndex === 1 || roadIndex === 2) {
        expect(spec.form, id).toBe('plane');
        expect(spec.grid, id).toBeDefined();
        expect(spec.grid!.cols, id).toBeLessThanOrEqual(4);
        expect(spec.grid!.cols * spec.grid!.rows, id).toBeLessThanOrEqual(16);
      }
    }
    // And the first of those is the smallest plane there is.
    const firstPlane = specs.find((s) => s.spec.form === 'plane')!.spec;
    expect(firstPlane.grid).toEqual({ cols: 3, rows: 3 });
  });

  it('brings the plane back as a small capstone once the road runs deep', () => {
    // Build a synthetic deep archive of ten boards and read its tail. The plane
    // returns only past `planeFromArchive`, only at the end, and never as more
    // than a few boards -- so no archive is ever a wall of them.
    const deep = DIFFICULTY_RAMP.planeFromArchive + 5;
    const boards = Array.from({ length: 10 }, (_, i) =>
      specFor({ id: `deep-${i}` } as unknown as Subject, i, 10, 'deep', deep),
    );
    const planes = boards.filter((b) => isTwoColour(b.difficulty));
    expect(planes.length).toBeGreaterThan(0);
    expect(planes.length).toBeLessThanOrEqual(DIFFICULTY_RAMP.planeCap);
    // They are the tail, and each is a plain square as a plane must be.
    const firstPlane = boards.findIndex((b) => isTwoColour(b.difficulty));
    expect(firstPlane).toBe(10 - planes.length);
    for (const plane of planes) {
      expect(plane.latticeKind).toBe('square');
      expect(plane.shape).toBe('full');
      expect(plane.form).toBe('plane');
    }
    // Before the tail, a deep archive is shapes, not more of the opening.
    for (const board of boards.slice(0, firstPlane)) {
      expect(board.form).toBe('silhouette');
    }
  });
});
