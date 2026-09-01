import { hueDelta } from '../color/tones';

/**
 * Giving every board in a category its own colour.
 *
 * A board takes its hue from its artwork, which works in isolation and fails
 * across a set. Measuring the twenty shipped space images, *fourteen* have a
 * dominant hue between 43 and 87 degrees -- lit dust and starlight are warm,
 * so almost every one of them wants to be the same amber. Played end to end
 * that is one puzzle wearing twenty titles.
 *
 * So hue is assigned per category rather than per subject: n evenly spaced
 * slots around the wheel, handed out so that each artwork gets the slot closest
 * to a colour it actually contains. Even spacing is what guarantees no two
 * boards repeat; the matching is what keeps the choice tied to the pictures
 * instead of being a palette someone picked.
 *
 * Each artwork nominates every chromatic cluster it has, not just its strongest,
 * which is what makes the matching worth doing. An image that is mostly gold but
 * has a real blue in it can take a blue slot cheaply and leave the gold to an
 * image that has nothing else -- so the artworks that genuinely own a colour
 * keep it, and the rotation lands on the ones with no opinion.
 */

export const HUE_TUNING = {
  /**
   * Cost in degrees of leaning on a cluster the artwork barely has, relative to
   * its strongest. Trades faithfulness against spread: at zero, a trace of blue
   * is as good a claim as a dominant gold.
   */
  weakCandidateCost: 70,
  /** Below this chroma a cluster has no hue worth claiming a slot with. */
  minCandidateChroma: 0.02,
  /** Passes of pairwise improvement over the greedy assignment. */
  maxRefinePasses: 40,
  /** Offsets of the slot grid to try, over one slot's width. */
  offsetSteps: 12,
} as const;

/** A hue an artwork contains, and how strongly. */
export interface HueCandidate {
  hue: number;
  chroma: number;
}

/** Shortest angular distance in degrees, 0..180. */
export function hueDistance(a: number, b: number): number {
  return Math.abs(hueDelta(a, b));
}

/**
 * What it costs subject `i` to be given `slot`: the closest claim it can make,
 * where leaning on a weaker cluster costs more.
 */
function slotCost(candidates: readonly HueCandidate[], slot: number): number {
  const strongest = Math.max(...candidates.map((c) => c.chroma));
  let best = Infinity;
  for (const c of candidates) {
    const weakness = strongest > 0 ? 1 - c.chroma / strongest : 1;
    best = Math.min(best, hueDistance(c.hue, slot) + HUE_TUNING.weakCandidateCost * weakness);
  }
  return best;
}

/** Usable claims for one subject, with a neutral fallback so it always has one. */
function claimsOf(candidates: readonly HueCandidate[], fallback: number): HueCandidate[] {
  const usable = candidates.filter((c) => c.chroma >= HUE_TUNING.minCandidateChroma);
  return usable.length > 0 ? [...usable] : [{ hue: fallback, chroma: 0 }];
}

function totalCost(claims: HueCandidate[][], slots: number[], assignment: number[]): number {
  let sum = 0;
  for (let i = 0; i < assignment.length; i++) {
    sum += slotCost(claims[i] as HueCandidate[], slots[assignment[i] as number] as number);
  }
  return sum;
}

/**
 * How far an assignment sits from the colours the artworks actually contain,
 * summed in degrees. Zero means every board kept a hue of its own. Used to
 * report how faithful a category's spread is, and to check the search.
 */
export function assignmentCost(
  candidates: readonly (readonly HueCandidate[])[],
  hues: readonly number[],
): number {
  const step = 360 / Math.max(1, candidates.length);
  return candidates.reduce(
    (sum, c, i) => sum + slotCost(claimsOf(c, i * step), hues[i] as number),
    0,
  );
}

/**
 * Greedy by most-constrained subject, then pairwise swaps until nothing
 * improves. Exhaustive search is factorial and a category can be any size;
 * refinement from a greedy start reaches the optimum on every case small enough
 * to check against brute force, which is what the test does.
 */
function assignToSlots(claims: HueCandidate[][], slots: number[]): number[] {
  const n = claims.length;
  const costs = claims.map((c) => slots.map((s) => slotCost(c, s)));

  // Most-constrained first: a subject whose best and second-best slots differ a
  // lot loses most by being displaced, so it chooses before an easygoing one.
  const regret = (i: number) => {
    const sorted = [...(costs[i] as number[])].sort((a, b) => a - b);
    return (sorted[1] ?? 0) - (sorted[0] ?? 0);
  };
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => regret(b) - regret(a) || a - b,
  );

  const assignment = new Array<number>(n).fill(-1);
  const taken = new Set<number>();
  for (const i of order) {
    let bestSlot = -1;
    let bestCost = Infinity;
    for (let s = 0; s < n; s++) {
      if (taken.has(s)) continue;
      const c = (costs[i] as number[])[s] as number;
      if (c < bestCost) {
        bestCost = c;
        bestSlot = s;
      }
    }
    assignment[i] = bestSlot;
    taken.add(bestSlot);
  }

  for (let pass = 0; pass < HUE_TUNING.maxRefinePasses; pass++) {
    let improved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const si = assignment[i] as number;
        const sj = assignment[j] as number;
        const before =
          ((costs[i] as number[])[si] as number) + ((costs[j] as number[])[sj] as number);
        const after =
          ((costs[i] as number[])[sj] as number) + ((costs[j] as number[])[si] as number);
        if (after < before - 1e-9) {
          assignment[i] = sj;
          assignment[j] = si;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return assignment;
}

/**
 * One distinct hue per subject, evenly spaced around the wheel and matched to
 * the colours each artwork actually contains.
 *
 * Deterministic: the same category always produces the same colours, so a
 * subject does not change colour between sessions.
 */
export function assignDistinctHues(
  candidates: readonly (readonly HueCandidate[])[],
): number[] {
  const n = candidates.length;
  if (n === 0) return [];
  // A lone subject keeps exactly what it has; there is nothing to space it from.
  if (n === 1) {
    const only = candidates[0] as readonly HueCandidate[];
    const strongest = [...only].sort((a, b) => b.chroma - a.chroma)[0];
    return [strongest ? strongest.hue : 0];
  }

  const step = 360 / n;
  // Spread the fallbacks apart, so subjects with no usable hue at all still land
  // on distinct slots rather than all claiming the same one.
  const claims = candidates.map((c, i) => claimsOf(c, i * step));

  let best: { hues: number[]; cost: number } | null = null;
  for (let k = 0; k < HUE_TUNING.offsetSteps; k++) {
    const offset = (k * step) / HUE_TUNING.offsetSteps;
    const slots = Array.from({ length: n }, (_, i) => (offset + i * step) % 360);
    const assignment = assignToSlots(claims, slots);
    const cost = totalCost(claims, slots, assignment);
    if (!best || cost < best.cost - 1e-9) {
      best = { hues: assignment.map((s) => slots[s] as number), cost };
    }
  }
  return (best as { hues: number[] }).hues;
}
