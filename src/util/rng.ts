/**
 * Small deterministic PRNG (mulberry32).
 *
 * Everything generative in this game -- k-means seeding, anchor placement, tile
 * shuffles, fact-tile selection -- draws from one of these. That makes a puzzle
 * fully reproducible from (subjectId, seed), which is what lets the tests assert
 * on generated output at all, and lets a player retry the exact same board.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Float in [lo, hi). */
  range(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick() from an empty array');
      return items[Math.floor(next() * items.length)] as T;
    },
  };
}

/** Stable string -> 32-bit hash, so a subject id alone can seed a puzzle. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** In-place Fisher-Yates using the supplied Rng. */
export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const a = items[i] as T;
    const b = items[j] as T;
    items[i] = b;
    items[j] = a;
  }
  return items;
}
