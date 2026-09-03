/**
 * Cutting a collection's mosaic into pieces, one share per puzzle.
 *
 * A collection is a single large image, and solving a puzzle uncovers that
 * puzzle's share of it. Which is why this has to produce a *complete* grid:
 * unlike the reveal mosaic in `render/reveal.ts`, which may leave a short last
 * row because tiles are what it is arranging, every cell here belongs to
 * somebody. A cell owned by nobody would be a patch of the picture that is
 * either permanently visible or permanently hidden, and both look like faults.
 *
 * So the grid is sized to hold at least one cell per subject and the surplus is
 * shared out from the front. Eleven subjects get a 4x3 grid of twelve, and the
 * first subject uncovers two.
 */

export interface MosaicPlan {
  cols: number;
  rows: number;
  /** Row-major cell indices each subject uncovers, in subject order. */
  cellsBySubject: number[][];
}

export function mosaicPlan(subjectCount: number): MosaicPlan {
  const n = Math.max(0, Math.floor(subjectCount));
  if (n === 0) return { cols: 0, rows: 0, cellsBySubject: [] };

  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cells = cols * rows;

  // Shares are handed out in order, so the picture fills roughly top to bottom
  // as a collection is worked through rather than appearing in scattered
  // patches. Watching it build is most of the point.
  const base = Math.floor(cells / n);
  const surplus = cells % n;

  const cellsBySubject: number[][] = [];
  let next = 0;
  for (let subject = 0; subject < n; subject++) {
    const take = base + (subject < surplus ? 1 : 0);
    cellsBySubject.push(Array.from({ length: take }, (_, i) => next + i));
    next += take;
  }
  return { cols, rows, cellsBySubject };
}

/** Cells uncovered so far, given which subjects are solved. */
export function uncoveredCells(plan: MosaicPlan, solved: readonly boolean[]): Set<number> {
  const out = new Set<number>();
  plan.cellsBySubject.forEach((cells, subject) => {
    if (solved[subject]) for (const cell of cells) out.add(cell);
  });
  return out;
}
