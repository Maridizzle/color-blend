import { type Oklab, deltaE } from '../color/oklab';

/**
 * Correctness.
 *
 * A cell is correct when the color sitting in it matches that cell's target
 * within tolerance -- matched on *color*, never on tile identity. That
 * distinction is the difference between a fair puzzle and a cruel one: wherever
 * the gradient produces two tiles a player cannot tell apart, those tiles are
 * genuinely interchangeable and both placements count. Nobody is ever asked to
 * find a difference they cannot see.
 */

export interface Arrangement {
  /** arrangement[cellId] = index into tileColors. */
  readonly order: number[];
  readonly tileColors: readonly Oklab[];
  readonly targets: readonly Oklab[];
  readonly tolerance: number;
}

export function colorAt(a: Arrangement, cellId: number): Oklab {
  return a.tileColors[a.order[cellId] as number] as Oklab;
}

export function isCellCorrect(a: Arrangement, cellId: number): boolean {
  return deltaE(colorAt(a, cellId), a.targets[cellId] as Oklab) <= a.tolerance;
}

export function correctnessMask(a: Arrangement): boolean[] {
  return a.order.map((_, cellId) => isCellCorrect(a, cellId));
}

export function countCorrect(a: Arrangement): number {
  let n = 0;
  for (let i = 0; i < a.order.length; i++) if (isCellCorrect(a, i)) n++;
  return n;
}

export function isSolved(a: Arrangement): boolean {
  for (let i = 0; i < a.order.length; i++) if (!isCellCorrect(a, i)) return false;
  return true;
}

export function swap(order: number[], x: number, y: number): void {
  const t = order[x] as number;
  order[x] = order[y] as number;
  order[y] = t;
}

/**
 * Find a swap that improves the board, preferring one that fixes two cells at
 * once. Returns null only when the board is solved.
 *
 * Two things this has to get right, both learned the hard way:
 *
 * Scoring the swap, not just finding a tile of the right color. The obvious
 * version happily lifts a tile out of an already-correct cell, fixing one and
 * breaking another for no net gain, so a player pressing Hint repeatedly would
 * watch it cycle between the same two cells forever.
 *
 * And a guaranteed way out. It is tempting to argue a positive-gain swap always
 * exists while the board is unsolved, but correctness is judged within a ΔE
 * tolerance, and tolerance is not transitive -- A can match B and B match C
 * while A and C do not. On coarse boards full of near-identical shades that
 * genuinely leaves states where every available swap nets zero. So the last
 * resort ignores color and sends a tile to its literal home cell, which adds a
 * fixed point to the arrangement every time and therefore always terminates.
 */
export function findHintSwap(
  a: Arrangement,
  locked: readonly boolean[],
): { from: number; to: number } | null {
  // Resolve colors and correctness once; the search below is quadratic, so
  // recomputing either inside it is the difference between a hint feeling
  // instant and feeling stuck on a large board.
  const n = a.order.length;
  const colors: Oklab[] = new Array(n);
  const correct: boolean[] = new Array(n);
  const wrong: number[] = [];
  for (let i = 0; i < n; i++) {
    colors[i] = colorAt(a, i);
    correct[i] = deltaE(colors[i] as Oklab, a.targets[i] as Oklab) <= a.tolerance;
    if (!locked[i] && !correct[i]) wrong.push(i);
  }
  if (wrong.length === 0) return null;

  let best: { from: number; to: number; gain: number } | null = null;

  for (const cell of wrong) {
    const want = a.targets[cell] as Oklab;
    const heldByCell = colors[cell] as Oklab;
    for (let source = 0; source < n; source++) {
      if (source === cell || locked[source]) continue;
      // Does `source` hold a tile that belongs in `cell`?
      if (deltaE(colors[source] as Oklab, want) > a.tolerance) continue;

      // `cell` always becomes correct. Whether `source` does depends on what it
      // receives, and it may have been correct already and is about to lose it.
      const sourceBecomesCorrect =
        deltaE(heldByCell, a.targets[source] as Oklab) <= a.tolerance;
      const gain = 1 + Number(sourceBecomesCorrect) - Number(correct[source]);

      if (gain === 2) return { from: cell, to: source };
      if (!best || gain > best.gain) best = { from: cell, to: source, gain };
    }
  }

  if (best && best.gain > 0) return { from: best.from, to: best.to };

  // Nothing gains outright. Reunite a wrong cell with its own tile: tile i is by
  // construction the tile whose color is cell i's target, so this always makes
  // that cell correct, and it strictly increases the number of tiles sitting at
  // home -- which is what guarantees termination.
  //
  // Take the *best* such reunion rather than the first. A home swap can never
  // lose ground (the cell it fixes was wrong, and the cell it displaces can
  // only stay put, break, or happen to be fixed), so scoring them costs one
  // pass and sometimes turns a hint that visibly does nothing into one that
  // moves the counter. A player pressing Hint and watching the tally sit still
  // has no way to tell a subtle correct move from a broken button.
  let bestHome: { from: number; to: number; gain: number } | null = null;
  for (const cell of wrong) {
    const source = a.order.indexOf(cell);
    // Locked cells always hold their own tile, so `source` is never locked.
    if (source < 0 || source === cell || locked[source]) continue;
    const displaced = deltaE(colors[cell] as Oklab, a.targets[source] as Oklab) <= a.tolerance;
    const gain = 1 + Number(displaced) - Number(correct[source]);
    if (!bestHome || gain > bestHome.gain) bestHome = { from: cell, to: source, gain };
    if (gain === 2) break;
  }
  if (bestHome) return { from: bestHome.from, to: bestHome.to };

  return best ? { from: best.from, to: best.to } : null;
}
