import type { Category, Subject } from '../content/types';
import type { IngestedCategory } from '../content/ingest';
import { SAMPLER_CATEGORIES } from '../content/sampler';

/**
 * The set of categories currently playable: what shipped, plus whatever packs
 * have been loaded this session.
 *
 * Pack categories live in memory only. Zip bytes are not written back to
 * storage, so a reload returns the game to its shipped content -- deliberate
 * for a first cut, since silently persisting someone else's archive is a
 * bigger decision than it looks.
 */

const packCategories: Category[] = [];

/**
 * Shipped collections first, then packs in the order they arrived. The road is
 * travelled in this order, so a pack joins the end of it -- and the shipped
 * archives keep their numbers however many packs are loaded.
 */
export function allCategories(): Category[] {
  return [...SAMPLER_CATEGORIES, ...packCategories];
}

export function addPackCategory(category: Category | IngestedCategory): void {
  const existing = packCategories.findIndex((c) => c.id === category.id);
  if (existing >= 0) packCategories.splice(existing, 1);
  packCategories.push(category);
}

export function findCategory(categoryId: string): Category | undefined {
  return allCategories().find((c) => c.id === categoryId);
}

export function findSubject(
  categoryId: string,
  subjectId: string,
): { category: Category; subject: Subject; index: number } | undefined {
  const category = findCategory(categoryId);
  if (!category) return undefined;
  const index = category.subjects.findIndex((s) => s.id === subjectId);
  if (index < 0) return undefined;
  return { category, subject: category.subjects[index] as Subject, index };
}
