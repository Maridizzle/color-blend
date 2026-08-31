import { type Oklab, deltaE, oklabToOklch } from './oklab';
import { type ImageData8 } from './image';
import { type Cluster, mergeClusters, quantize } from './quantize';

/**
 * Palette extraction and the blind-pack quality gate.
 *
 * Packs arrive unseen, so nothing here may assume a human looked at the image
 * first. Two jobs follow from that: pick anchor colors that make a good puzzle
 * automatically, and refuse -- loudly -- to build a puzzle from an image that
 * cannot make a good one.
 */

/** Every tunable in the palette stage, gathered so tuning is one edit. */
export const PALETTE_TUNING = {
  /** Clusters closer than this are the same shade as far as a player is concerned. */
  mergeDeltaE: 0.09,
  /** Clusters requested from k-means before merging. */
  k: 12,
  /** Chroma's pull on salience, so the "key shade" is a real color, not background gray. */
  chromaWeight: 2.5,
  /** A cluster below this share of the image is texture, not a shade of the artwork. */
  minAnchorWeight: 0.02,
  /** Below this separation an extra anchor adds nothing a player could see. */
  minAnchorSeparation: 0.06,

  /** Max pairwise anchor distance below this cannot make a sortable board. */
  rejectSpread: 0.15,
  /** ...and below this it makes a joyless one. */
  warnSpread: 0.28,
  /** Anchor lightness range below this undercuts the darkest-to-lightest framing. */
  warnLightnessRange: 0.1,
  /** Gray mush: no lightness story and no hue story either. */
  rejectFlatLightness: 0.06,
  rejectFlatChroma: 0.035,
  /** Anything smaller cannot be sampled into a mosaic worth revealing. */
  minImageDim: 48,
} as const;

export type QualityVerdict = 'ok' | 'warn' | 'reject';

export interface QualityIssue {
  code:
    | 'too-small'
    | 'too-few-shades'
    | 'flat'
    | 'narrow-range'
    | 'low-contrast'
    | 'low-lightness-range';
  message: string;
}

export interface Palette {
  /** Distinct shades found in the image, heaviest first. */
  clusters: Cluster[];
  /**
   * The colors the puzzle gradient is built from, sorted dark to light.
   * Between 2 and `count` of them.
   */
  anchors: Oklab[];
  /** The single most characteristic color of the artwork. */
  keyShade: Oklab;
  /** Largest pairwise perceptual distance among the anchors. */
  spread: number;
  /** Anchor lightness range, i.e. how strong the dark-to-light axis is. */
  lightnessRange: number;
  verdict: QualityVerdict;
  issues: QualityIssue[];
}

/**
 * How characteristic a cluster is of the image.
 *
 * The square root damps raw area so a big flat background does not
 * automatically win, and the chroma term promotes colors a viewer would
 * actually name. Without it the "key shade" of most photographs comes out as a
 * muddy mid-gray, which makes for a dull board.
 */
export function salience(cluster: Cluster): number {
  const { C } = oklabToOklch(cluster.color);
  return Math.sqrt(cluster.weight) * (1 + PALETTE_TUNING.chromaWeight * C);
}

/**
 * Choose gradient anchors.
 *
 * The darkest and lightest substantial shades come first and are placed at
 * opposite ends of the board later, which is what guarantees the board has a
 * legible dark-to-light axis to sort along no matter what the image looks like.
 * Remaining slots go to shades that are both salient and far from what is
 * already chosen -- that product is what puts the hue transitions in.
 */
function selectAnchorsAtThreshold(
  clusters: readonly Cluster[],
  count: number,
  minWeight: number,
  minSeparation: number,
): Cluster[] {
  let candidates = clusters.filter((c) => c.weight >= minWeight);
  if (candidates.length < 2) candidates = [...clusters].slice(0, Math.max(2, count));

  const byLightness = [...candidates].sort((a, b) => a.color.L - b.color.L);
  const darkest = byLightness[0] as Cluster;
  const lightest = byLightness[byLightness.length - 1] as Cluster;

  const chosen: Cluster[] = darkest === lightest ? [darkest] : [darkest, lightest];

  while (chosen.length < count) {
    let best: Cluster | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      if (chosen.includes(c)) continue;
      const separation = Math.min(...chosen.map((s) => deltaE(s.color, c.color)));
      if (separation < minSeparation) continue;
      const score = salience(c) * separation;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen;
}

export function selectAnchors(clusters: readonly Cluster[], count: number): Oklab[] {
  if (clusters.length === 0) return [];
  if (clusters.length === 1) return [(clusters[0] as Cluster).color];

  // Two anchors is a degenerate board: every color in the field then lies on a
  // single line in Oklab, so whole bands come out identical and the puzzle
  // collapses into sorting stripes. Worth relaxing the "is this shade
  // substantial enough" floor to find a third real shade in the image before
  // settling for that -- these are still the artwork's own colors, just
  // minor ones.
  const relaxations: [number, number][] = [
    [PALETTE_TUNING.minAnchorWeight, PALETTE_TUNING.minAnchorSeparation],
    [PALETTE_TUNING.minAnchorWeight / 4, PALETTE_TUNING.minAnchorSeparation / 2],
    [0, PALETTE_TUNING.minAnchorSeparation / 3],
  ];

  let chosen: Cluster[] = [];
  for (const [minWeight, minSeparation] of relaxations) {
    chosen = selectAnchorsAtThreshold(clusters, count, minWeight, minSeparation);
    if (chosen.length >= Math.min(3, count)) break;
  }

  return chosen.map((c) => c.color).sort((a, b) => a.L - b.L);
}

function maxPairwise(colors: readonly Oklab[]): number {
  let max = 0;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      max = Math.max(max, deltaE(colors[i] as Oklab, colors[j] as Oklab));
    }
  }
  return max;
}

export interface ExtractOptions {
  /** Upper bound on gradient anchors. More anchors means more hue transitions. */
  anchorCount?: number;
  seed?: number;
}

/**
 * Full palette pass over an image: cluster, merge, choose anchors, and judge
 * whether this image can carry a puzzle at all.
 */
export function extractPalette(img: ImageData8, options: ExtractOptions = {}): Palette {
  const { anchorCount = 4, seed = 0x9e3779b9 } = options;

  const raw = quantize(img, { k: PALETTE_TUNING.k, seed });
  const clusters = mergeClusters(raw, PALETTE_TUNING.mergeDeltaE);
  const anchors = selectAnchors(clusters, anchorCount);

  // Severity is carried on each issue and the verdict derived at the end,
  // rather than tracked in a mutable flag, so adding a check cannot get the
  // final verdict wrong by forgetting the precedence between them.
  const issues: (QualityIssue & { severity: 'warn' | 'reject' })[] = [];
  const fail = (issue: QualityIssue) => issues.push({ ...issue, severity: 'reject' });
  const warn = (issue: QualityIssue) => issues.push({ ...issue, severity: 'warn' });
  const rejected = () => issues.some((i) => i.severity === 'reject');

  if (Math.min(img.width, img.height) < PALETTE_TUNING.minImageDim) {
    fail({
      code: 'too-small',
      message: `Image is ${img.width}x${img.height}; needs at least ${PALETTE_TUNING.minImageDim}px on the short edge.`,
    });
  }

  if (anchors.length < 2) {
    fail({
      code: 'too-few-shades',
      message: 'Fewer than two distinct shades; there is nothing to sort.',
    });
  }

  const spread = maxPairwise(anchors);
  const lightnessRange =
    anchors.length > 0
      ? (anchors[anchors.length - 1] as Oklab).L - (anchors[0] as Oklab).L
      : 0;
  const maxChroma = Math.max(0, ...clusters.map((c) => oklabToOklch(c.color).C));

  if (
    lightnessRange < PALETTE_TUNING.rejectFlatLightness &&
    maxChroma < PALETTE_TUNING.rejectFlatChroma
  ) {
    fail({
      code: 'flat',
      message: 'Image is near-uniform in both lightness and color; no gradient can be built.',
    });
  } else if (spread < PALETTE_TUNING.rejectSpread && anchors.length >= 2) {
    fail({
      code: 'narrow-range',
      message: `Shades span only ${spread.toFixed(3)} in Oklab; too close to tell apart.`,
    });
  } else if (spread < PALETTE_TUNING.warnSpread) {
    warn({
      code: 'low-contrast',
      message: `Shades span ${spread.toFixed(3)}; the puzzle will be hard to read. Tile count reduced.`,
    });
  }

  if (!rejected() && lightnessRange < PALETTE_TUNING.warnLightnessRange && anchors.length >= 2) {
    warn({
      code: 'low-lightness-range',
      message: 'Little variation in lightness; players will sort mostly by hue.',
    });
  }

  const verdict: QualityVerdict = rejected() ? 'reject' : issues.length > 0 ? 'warn' : 'ok';

  const keyShade =
    clusters.length > 0
      ? ([...clusters].sort((a, b) => salience(b) - salience(a))[0] as Cluster).color
      : ({ L: 0.5, a: 0, b: 0 } as Oklab);

  return { clusters, anchors, keyShade, spread, lightnessRange, verdict, issues };
}
