import { describe, expect, it } from 'vitest';
import { SAMPLER_CATEGORIES } from '../src/content/sampler';
import { addPackCategory, allCategories } from '../src/game/library';

describe('the road order', () => {
  it('keeps the shipped archives first and appends packs after them', () => {
    const shipped = SAMPLER_CATEGORIES.map((c) => c.id);
    expect(allCategories().map((c) => c.id)).toEqual(shipped);

    addPackCategory({ id: 'pack-one', title: 'Pack One', subjects: [], fromPack: true });
    addPackCategory({ id: 'pack-two', title: 'Pack Two', subjects: [], fromPack: true });
    expect(allCategories().map((c) => c.id)).toEqual([...shipped, 'pack-one', 'pack-two']);
  });

  it('reloading a pack replaces it rather than duplicating it', () => {
    addPackCategory({ id: 'pack-one', title: 'Pack One, again', subjects: [], fromPack: true });
    const ids = allCategories().map((c) => c.id);
    expect(ids.filter((id) => id === 'pack-one')).toHaveLength(1);
    expect(allCategories().find((c) => c.id === 'pack-one')?.title).toBe('Pack One, again');
  });
});
