import { type Oklab, deltaE, rgbToOklab } from './oklab';
import { type ImageData8, downscale } from './image';
import { type Rng, makeRng } from '../util/rng';

/** One color cluster found in an image. */
export interface Cluster {
  /** Cluster centroid, in Oklab. */
  color: Oklab;
  /** Fraction of sampled pixels belonging to this cluster, 0..1. */
  weight: number;
}

export interface QuantizeOptions {
  /** Number of clusters to look for before merging. */
  k?: number;
  /** Long-edge size the image is reduced to before sampling. */
  sampleDim?: number;
  maxIterations?: number;
  seed?: number;
  /** Pixels with alpha below this are ignored entirely. */
  alphaThreshold?: number;
}

/** Pull an Oklab sample array out of an image, dropping transparent pixels. */
export function sampleOklab(img: ImageData8, sampleDim = 128, alphaThreshold = 8): Oklab[] {
  const small = downscale(img, sampleDim);
  const out: Oklab[] = [];
  for (let i = 0; i < small.data.length; i += 4) {
    if ((small.data[i + 3] ?? 255) < alphaThreshold) continue;
    out.push(
      rgbToOklab({
        r: small.data[i] ?? 0,
        g: small.data[i + 1] ?? 0,
        b: small.data[i + 2] ?? 0,
      }),
    );
  }
  return out;
}

/** k-means++ seeding: spread the initial centroids out so k-means converges well. */
function seedCentroids(samples: readonly Oklab[], k: number, rng: Rng): Oklab[] {
  const centroids: Oklab[] = [samples[rng.int(samples.length)] as Oklab];
  const d2 = new Float64Array(samples.length).fill(Infinity);

  while (centroids.length < k) {
    const latest = centroids[centroids.length - 1] as Oklab;
    let total = 0;
    for (let i = 0; i < samples.length; i++) {
      const d = deltaE(samples[i] as Oklab, latest);
      const sq = d * d;
      if (sq < (d2[i] as number)) d2[i] = sq;
      total += d2[i] as number;
    }
    if (total <= 0) break; // every sample is already a centroid

    let target = rng.next() * total;
    let chosen = samples.length - 1;
    for (let i = 0; i < samples.length; i++) {
      target -= d2[i] as number;
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push(samples[chosen] as Oklab);
  }
  return centroids;
}

/**
 * k-means in Oklab. Returns clusters sorted by weight, heaviest first.
 *
 * Clustering in a perceptual space rather than RGB matters here: RGB k-means
 * happily splits a single perceived color across several clusters while merging
 * two colors a player sees as distinct.
 */
export function quantize(img: ImageData8, options: QuantizeOptions = {}): Cluster[] {
  const {
    k = 10,
    sampleDim = 128,
    maxIterations = 24,
    seed = 0x9e3779b9,
    alphaThreshold = 8,
  } = options;

  const samples = sampleOklab(img, sampleDim, alphaThreshold);
  if (samples.length === 0) return [];

  const rng = makeRng(seed);
  const effectiveK = Math.max(1, Math.min(k, samples.length));
  let centroids = seedCentroids(samples, effectiveK, rng);
  const assignment = new Int32Array(samples.length).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    let moved = false;

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i] as Oklab;
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = deltaE(s, centroids[c] as Oklab);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assignment[i] !== best) {
        assignment[i] = best;
        moved = true;
      }
    }

    const sumL = new Float64Array(centroids.length);
    const sumA = new Float64Array(centroids.length);
    const sumB = new Float64Array(centroids.length);
    const count = new Int32Array(centroids.length);
    for (let i = 0; i < samples.length; i++) {
      const c = assignment[i] as number;
      const s = samples[i] as Oklab;
      sumL[c] = (sumL[c] as number) + s.L;
      sumA[c] = (sumA[c] as number) + s.a;
      sumB[c] = (sumB[c] as number) + s.b;
      count[c] = (count[c] as number) + 1;
    }

    centroids = centroids.map((old, c) => {
      const n = count[c] as number;
      if (n === 0) return old;
      return {
        L: (sumL[c] as number) / n,
        a: (sumA[c] as number) / n,
        b: (sumB[c] as number) / n,
      };
    });

    if (!moved) break;
  }

  const count = new Int32Array(centroids.length);
  for (let i = 0; i < samples.length; i++) {
    const c = assignment[i] as number;
    count[c] = (count[c] as number) + 1;
  }

  return centroids
    .map((color, c) => ({ color, weight: (count[c] as number) / samples.length }))
    .filter((c) => c.weight > 0)
    .sort((x, y) => y.weight - x.weight);
}

/**
 * Fold clusters closer together than `minDeltaE` into one, weight-averaged.
 *
 * Without this a photo of a blue sky yields six barely-distinguishable blues and
 * the puzzle becomes a pixel-hunt rather than a sort.
 */
export function mergeClusters(clusters: readonly Cluster[], minDeltaE: number): Cluster[] {
  const merged: Cluster[] = [];
  // Heaviest first, so the dominant shade defines each merged group's identity.
  for (const cluster of [...clusters].sort((a, b) => b.weight - a.weight)) {
    const near = merged.find((m) => deltaE(m.color, cluster.color) < minDeltaE);
    if (!near) {
      merged.push({ ...cluster });
      continue;
    }
    const total = near.weight + cluster.weight;
    near.color = {
      L: (near.color.L * near.weight + cluster.color.L * cluster.weight) / total,
      a: (near.color.a * near.weight + cluster.color.a * cluster.weight) / total,
      b: (near.color.b * near.weight + cluster.color.b * cluster.weight) / total,
    };
    near.weight = total;
  }
  return merged.sort((a, b) => b.weight - a.weight);
}
