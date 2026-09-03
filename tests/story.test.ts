import { describe, expect, it } from 'vitest';
import { SAMPLER_CATEGORIES } from '../src/content/sampler';
import { CHAPTERS, TALES, chapterFor, taleFor } from '../src/content/story';
import { cellOwners, collectionState, passageFor } from '../src/game/story';
import { mosaicPlan } from '../src/game/mosaic';
import type { Progress } from '../src/game/persistence';

function progressWith(solvedIds: string[]): Progress {
  const solved: Progress['solved'] = {};
  for (const id of solvedIds) solved[id] = { moves: 10, at: 0 } as Progress['solved'][string];
  return { solved, facts: {} } as Progress;
}

describe('the tale matches the shipped content', () => {
  it('only ever names collections that exist, so no story is unreachable', () => {
    const shipped = new Set(SAMPLER_CATEGORIES.map((c) => c.id));
    for (const tale of TALES) expect(shipped.has(tale.categoryId)).toBe(true);
    for (const chapter of CHAPTERS) {
      for (const id of chapter.collectionIds) expect(shipped.has(id)).toBe(true);
    }
  });

  it('lists each collection in exactly one chapter, and every tale in a chapter', () => {
    const listed = CHAPTERS.flatMap((c) => c.collectionIds);
    expect(new Set(listed).size).toBe(listed.length);
    for (const tale of TALES) {
      expect(chapterFor(tale.categoryId)?.number).toBe(tale.chapterNumber);
    }
  });

  // A collection can ship before its story is written -- it gets a station, a
  // mosaic and an honest note in its gallery. What is not allowed is a *partial*
  // tale, which would silently drop scenes off the end of a collection.
  for (const category of SAMPLER_CATEGORIES.filter((c) => taleFor(c.id))) {
    it(`${category.id}: one entry per subject, in order, each with a scene`, () => {
      const tale = taleFor(category.id)!;
      expect(tale.entries.map((e) => e.subjectId)).toEqual(category.subjects.map((s) => s.id));
      expect(tale.opening.length).toBeGreaterThan(0);
      for (const entry of tale.entries) {
        expect(entry.passage.length).toBeGreaterThan(0);
        // Every folio delivers a scene, not an offcut. This is the floor the
        // generator enforces; asserting it here keeps it true of shipped data.
        expect(entry.passage.join(' ').split(/\s+/).length).toBeGreaterThanOrEqual(90);
      }
    });
  }

  it('leaves an unwritten collection playable rather than half-told', () => {
    const unwritten = SAMPLER_CATEGORIES.filter((c) => !taleFor(c.id));
    for (const category of unwritten) {
      // No tale at all, and so no chapter claiming it half-finished.
      expect(chapterFor(category.id)).toBeUndefined();
      expect(category.subjects.length).toBeGreaterThan(0);
    }
  });

  it('carries no leftover markup from the source document', () => {
    for (const tale of [...TALES, ...CHAPTERS.map((c) => ({ opening: c.closing, entries: [] as never[] }))]) {
      const texts = [...tale.opening, ...tale.entries.flatMap((e: { passage: string[] }) => e.passage)];
      for (const text of texts) {
        expect(text).not.toMatch(/\*\*|^>|\n/);
        // Emphasis markers come in pairs.
        expect((text.match(/\*/g) ?? []).length % 2).toBe(0);
      }
    }
  });

  it('gives every chapter a cliffhanger, on the chapter rather than a collection', () => {
    for (const chapter of CHAPTERS) {
      expect(chapter.closing.length).toBeGreaterThan(0);
      expect(chapter.collectionIds.length).toBeGreaterThan(0);
    }
  });
});

describe('collectionState', () => {
  const cosmos = SAMPLER_CATEGORIES.find((c) => c.id === 'cosmos')!;

  it('starts sealed: nothing uncovered, no passages, not complete', () => {
    const state = collectionState(cosmos, progressWith([]));
    expect(state.uncovered.size).toBe(0);
    expect(state.passages).toEqual([]);
    expect(state.sealed).toBe(cosmos.subjects.length);
    expect(state.complete).toBe(false);
  });

  it('unlocks the solved subjects’ pieces and passages, in subject order', () => {
    const [first, second] = cosmos.subjects;
    const state = collectionState(cosmos, progressWith([second!.id, first!.id]));
    const plan = mosaicPlan(cosmos.subjects.length);
    const expected = new Set([...plan.cellsBySubject[0]!, ...plan.cellsBySubject[1]!]);
    expect(state.uncovered).toEqual(expected);
    expect(state.passages.map((p) => p.index)).toEqual([0, 1]);
    expect(state.passages[0]!.entry.subjectId).toBe(first!.id);
    expect(state.sealed).toBe(cosmos.subjects.length - 2);
  });

  it('is complete when every subject is solved', () => {
    const state = collectionState(cosmos, progressWith(cosmos.subjects.map((s) => s.id)));
    expect(state.complete).toBe(true);
    expect(state.uncovered.size).toBe(state.plan.cols * state.plan.rows);
    expect(state.sealed).toBe(0);
  });

  it('holds the cliffhanger back until the whole chapter is done', () => {
    const chapter = CHAPTERS[0]!;
    const road = chapter.collectionIds.map((id) => SAMPLER_CATEGORIES.find((c) => c.id === id)!);
    const last = road[road.length - 1]!;
    const allIds = road.flatMap((c) => c.subjects.map((s) => s.id));

    // The chapter's last collection finished, but not the ones before it.
    const onlyLast = collectionState(last, progressWith(last.subjects.map((s) => s.id)), road);
    expect(onlyLast.complete).toBe(true);
    expect(onlyLast.chapterClosing).toBeUndefined();

    // Everything done: the cliffhanger lands, and only on the chapter's end.
    const done = progressWith(allIds);
    expect(collectionState(last, done, road).chapterClosing).toBeDefined();
    expect(collectionState(road[0]!, done, road).chapterClosing).toBeUndefined();
  });

  it('lets a pack join the end of the road without stealing the ending', () => {
    const chapter = CHAPTERS[0]!;
    const authored = chapter.collectionIds.map((id) => SAMPLER_CATEGORIES.find((c) => c.id === id)!);
    const pack = { id: 'a-visiting-pack', title: 'A Visiting Archive', subjects: cosmos.subjects, fromPack: true };
    const road = [...authored, pack];
    const done = progressWith(authored.flatMap((c) => c.subjects.map((s) => s.id)));

    // The chapter ends where it was written to end, not at the road's last stop.
    expect(collectionState(authored[authored.length - 1]!, done, road).chapterClosing).toBeDefined();
    const packState = collectionState(pack, done, road);
    expect(packState.chapterClosing).toBeUndefined();
    expect(packState.chapter).toBeUndefined();
    expect(packState.tale).toBeUndefined();
  });

  it('gives a pack with no tale a mosaic but no passages', () => {
    const pack = { ...cosmos, id: 'a-visiting-pack', fromPack: true };
    const state = collectionState(pack, progressWith([cosmos.subjects[0]!.id]));
    expect(state.tale).toBeUndefined();
    expect(state.uncovered.size).toBeGreaterThan(0);
    expect(state.passages).toEqual([]);
  });
});

describe('passageFor and cellOwners', () => {
  it('finds the scene by subject id', () => {
    const cosmos = SAMPLER_CATEGORIES.find((c) => c.id === 'cosmos')!;
    expect(passageFor(cosmos, 'saturn')?.join(' ')).toMatch(/grand things are old things/i);
    expect(passageFor(cosmos, 'no-such-subject')).toBeUndefined();
  });

  it('assigns every cell to exactly one owner', () => {
    for (const n of [1, 2, 7, 9, 11, 30]) {
      const plan = mosaicPlan(n);
      const owners = cellOwners(plan);
      expect(owners).toHaveLength(plan.cols * plan.rows);
      expect(new Set(owners).size).toBe(n);
    }
  });
});
