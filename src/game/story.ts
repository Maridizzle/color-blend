import type { Category, CollectionTale, TaleEntry } from '../content/types';
import { taleFor } from '../content/story';
import { type MosaicPlan, mosaicPlan, uncoveredCells } from './mosaic';
import type { Progress } from './persistence';

/**
 * What the Archivist has recorded so far, for one collection.
 *
 * All of it is derived from `progress.solved` rather than stored. Solving a
 * puzzle is the only thing that advances the story, so keeping a second copy of
 * that fact would only be a second thing that could disagree with the first.
 */
export interface CollectionState {
  category: Category;
  tale: CollectionTale | undefined;
  plan: MosaicPlan;
  /** Per subject, in the category's own order. */
  solved: boolean[];
  solvedCount: number;
  /** Mosaic cells earned so far. */
  uncovered: Set<number>;
  /** Tale entries unlocked, in subject order. */
  passages: { index: number; subjectTitle: string; entry: TaleEntry }[];
  /** Subjects still to solve. */
  sealed: number;
  complete: boolean;
}

export function collectionState(category: Category, progress: Progress): CollectionState {
  const solved = category.subjects.map((s) => Boolean(progress.solved[s.id]));
  const plan = mosaicPlan(category.subjects.length);
  const tale = taleFor(category.id);

  // Entries are matched by subject id, never by position, so a collection
  // whose subjects are reordered keeps every passage on the right picture.
  const passages = category.subjects.flatMap((subject, index) => {
    if (!solved[index]) return [];
    const entry = tale?.entries.find((e) => e.subjectId === subject.id);
    return entry ? [{ index, subjectTitle: subject.title, entry }] : [];
  });

  const solvedCount = solved.filter(Boolean).length;
  return {
    category,
    tale,
    plan,
    solved,
    solvedCount,
    uncovered: uncoveredCells(plan, solved),
    passages,
    sealed: category.subjects.length - solvedCount,
    complete: solvedCount === category.subjects.length && category.subjects.length > 0,
  };
}

/** The reveal-panel blurb for one subject, if the tale has reached it. */
export function blurbFor(category: Category, subjectId: string): string | undefined {
  return taleFor(category.id)?.entries.find((e) => e.subjectId === subjectId)?.blurb;
}

/** Which subject owns each cell of a plan, row-major. */
export function cellOwners(plan: MosaicPlan): number[] {
  const owners = new Array<number>(plan.cols * plan.rows).fill(0);
  plan.cellsBySubject.forEach((cells, subject) => {
    for (const cell of cells) owners[cell] = subject;
  });
  return owners;
}
