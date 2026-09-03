import { describe, expect, it } from 'vitest';
import { SAMPLER_CATEGORIES } from '../src/content/sampler';
import { TALES, taleFor } from '../src/content/story';
import { blurbFor, cellOwners, collectionState } from '../src/game/story';
import { mosaicPlan } from '../src/game/mosaic';
import type { Progress } from '../src/game/persistence';

function progressWith(solvedIds: string[]): Progress {
  const solved: Progress['solved'] = {};
  for (const id of solvedIds) solved[id] = { moves: 10, at: 0 } as Progress['solved'][string];
  return { solved, facts: {} } as Progress;
}

describe('the tale matches the shipped content', () => {
  it('has a section for every shipped collection, and no extras', () => {
    expect(TALES.map((t) => t.categoryId).sort()).toEqual(SAMPLER_CATEGORIES.map((c) => c.id).sort());
  });

  for (const category of SAMPLER_CATEGORIES) {
    it(`${category.id}: one entry per subject, in order, each with a blurb and a passage`, () => {
      const tale = taleFor(category.id);
      expect(tale).toBeDefined();
      expect(tale!.entries.map((e) => e.subjectId)).toEqual(category.subjects.map((s) => s.id));
      expect(tale!.opening.length).toBeGreaterThan(0);
      for (const entry of tale!.entries) {
        expect(entry.blurb.length).toBeGreaterThan(40);
        // Short enough for a reveal panel on a phone.
        expect(entry.blurb.split(/\s+/).length).toBeLessThanOrEqual(90);
        expect(entry.passage.length).toBeGreaterThan(0);
      }
    });
  }

  it('carries no leftover markup from the source document', () => {
    for (const tale of TALES) {
      const texts = [...tale.opening, ...(tale.closing ?? []), ...tale.entries.flatMap((e) => [e.blurb, ...e.passage])];
      for (const text of texts) {
        expect(text).not.toMatch(/\*\*|^>|\n/);
        // Emphasis markers come in pairs.
        expect((text.match(/\*/g) ?? []).length % 2).toBe(0);
      }
    }
  });

  it('ends the chapter on the last shipped collection', () => {
    const last = SAMPLER_CATEGORIES[SAMPLER_CATEGORIES.length - 1]!;
    expect(taleFor(last.id)?.closing?.length ?? 0).toBeGreaterThan(0);
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

  it('gives a pack with no tale a mosaic but no passages', () => {
    const pack = { ...cosmos, id: 'a-visiting-pack', fromPack: true };
    const state = collectionState(pack, progressWith([cosmos.subjects[0]!.id]));
    expect(state.tale).toBeUndefined();
    expect(state.uncovered.size).toBeGreaterThan(0);
    expect(state.passages).toEqual([]);
  });
});

describe('blurbFor and cellOwners', () => {
  it('finds the blurb by subject id', () => {
    const cosmos = SAMPLER_CATEGORIES.find((c) => c.id === 'cosmos')!;
    expect(blurbFor(cosmos, 'saturn')).toMatch(/grand things are old things/);
    expect(blurbFor(cosmos, 'no-such-subject')).toBeUndefined();
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
