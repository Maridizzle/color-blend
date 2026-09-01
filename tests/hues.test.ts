import { describe, expect, it } from 'vitest';
import {
  HUE_TUNING,
  type HueCandidate,
  assignDistinctHues,
  assignmentCost,
  hueDistance,
} from '../src/content/hues';

const one = (hue: number, chroma = 0.12): HueCandidate[] => [{ hue, chroma }];

/** The measured shape of the shipped pack: mostly warm, a few with a real cool. */
const SPACE_PACK: HueCandidate[][] = [
  [{ hue: 357, chroma: 0.12 }, { hue: 100, chroma: 0.07 }],
  [{ hue: 44, chroma: 0.1 }, { hue: 333, chroma: 0.06 }],
  [{ hue: 71, chroma: 0.13 }],
  [{ hue: 82, chroma: 0.09 }, { hue: 245, chroma: 0.05 }],
  [{ hue: 87, chroma: 0.05 }, { hue: 268, chroma: 0.03 }],
  [{ hue: 65, chroma: 0.13 }],
  [{ hue: 236, chroma: 0.06 }, { hue: 32, chroma: 0.05 }],
  [{ hue: 43, chroma: 0.12 }],
  [{ hue: 218, chroma: 0.1 }],
  [{ hue: 70, chroma: 0.09 }],
  [{ hue: 15, chroma: 0.12 }, { hue: 287, chroma: 0.06 }],
  [{ hue: 64, chroma: 0.07 }],
  [{ hue: 80, chroma: 0.06 }],
  [{ hue: 76, chroma: 0.09 }],
  [{ hue: 5, chroma: 0.15 }, { hue: 288, chroma: 0.09 }],
  [{ hue: 85, chroma: 0.11 }],
  [{ hue: 58, chroma: 0.05 }],
  [{ hue: 177, chroma: 0.05 }],
  [{ hue: 83, chroma: 0.13 }],
  [{ hue: 81, chroma: 0.11 }],
];

/** Smallest gap between any two hues in a set. */
function minSeparation(hues: readonly number[]): number {
  let min = Infinity;
  for (let i = 0; i < hues.length; i++)
    for (let j = i + 1; j < hues.length; j++)
      min = Math.min(min, hueDistance(hues[i] as number, hues[j] as number));
  return min;
}

describe('distinct hues across a category', () => {
  it('never repeats a colour, even when every artwork wants the same one', () => {
    // The case that forced this to exist: lit dust and starlight are warm, so
    // fourteen of the twenty shipped images want a hue between 43 and 87.
    const allAmber = Array.from({ length: 20 }, (_, i) => one(60 + (i % 5)));
    const hues = assignDistinctHues(allAmber);
    expect(hues).toHaveLength(20);
    expect(minSeparation(hues)).toBeGreaterThan(360 / 20 - 1e-6);
  });

  it('spreads the real pack evenly around the wheel', () => {
    const hues = assignDistinctHues(SPACE_PACK);
    expect(hues).toHaveLength(SPACE_PACK.length);
    expect(minSeparation(hues)).toBeGreaterThan(360 / SPACE_PACK.length - 1e-6);
    expect(new Set(hues.map((h) => Math.round(h)))).toHaveProperty(
      'size',
      SPACE_PACK.length,
    );
  });

  it('gives a cool slot to an artwork that has one, not to a purely warm one', () => {
    // The point of nominating every cluster rather than only the strongest: the
    // artwork that genuinely owns a blue should be the one that gets to keep it.
    const candidates: HueCandidate[][] = [
      [{ hue: 60, chroma: 0.12 }], // nothing but gold
      [{ hue: 60, chroma: 0.12 }, { hue: 240, chroma: 0.11 }], // gold and a real blue
    ];
    const [pureGold, hasBlue] = assignDistinctHues(candidates) as [number, number];
    expect(hueDistance(hasBlue, 240)).toBeLessThan(hueDistance(pureGold, 240));
  });

  it('matches an exhaustive search on categories small enough to check', () => {
    // The search is greedy plus pairwise repair, so its quality is a claim that
    // needs testing rather than asserting.
    const cases: HueCandidate[][][] = [
      [one(10), one(12), one(14)],
      [one(10), one(200), one(12), one(205)],
      [one(0), one(0), one(0), one(0), one(0)],
      [
        [{ hue: 30, chroma: 0.1 }, { hue: 210, chroma: 0.08 }],
        [{ hue: 35, chroma: 0.12 }],
        [{ hue: 40, chroma: 0.05 }, { hue: 300, chroma: 0.04 }],
        [{ hue: 200, chroma: 0.09 }],
        [{ hue: 33, chroma: 0.11 }],
      ],
    ];

    for (const candidates of cases) {
      const n = candidates.length;
      const step = 360 / n;
      const mine = assignmentCost(candidates, assignDistinctHues(candidates));

      let bestBrute = Infinity;
      for (let k = 0; k < HUE_TUNING.offsetSteps; k++) {
        const offset = (k * step) / HUE_TUNING.offsetSteps;
        const slots = Array.from({ length: n }, (_, i) => (offset + i * step) % 360);
        for (const perm of permutations(slots)) {
          bestBrute = Math.min(bestBrute, assignmentCost(candidates, perm));
        }
      }
      expect(mine, `n=${n}`).toBeLessThanOrEqual(bestBrute + 1e-6);
    }
  });

  it('is deterministic, so a subject keeps its colour between sessions', () => {
    expect(assignDistinctHues(SPACE_PACK)).toEqual(assignDistinctHues(SPACE_PACK));
  });

  it('leaves a lone subject exactly the hue it has', () => {
    expect(assignDistinctHues([[{ hue: 42, chroma: 0.1 }, { hue: 200, chroma: 0.02 }]]))
      .toEqual([42]);
  });

  it('handles artworks with no usable hue at all', () => {
    const grey = Array.from({ length: 4 }, () => [{ hue: 0, chroma: 0 }]);
    const hues = assignDistinctHues(grey);
    expect(hues).toHaveLength(4);
    expect(minSeparation(hues)).toBeGreaterThan(360 / 4 - 1e-6);
  });

  it('returns nothing for an empty category', () => {
    expect(assignDistinctHues([])).toEqual([]);
  });
});

function* permutations<T>(items: readonly T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield [...items];
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) yield [items[i] as T, ...p];
  }
}
