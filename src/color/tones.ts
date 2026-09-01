import { type Oklab, type Oklch, oklabToOklch, oklchToOklab } from './oklab';
import { fitToGamut } from './gamut';
import { inSrgbGamut } from './oklab';

/**
 * Turning an artwork's palette into a board a person can read.
 *
 * The problem this solves: a twelve-tile board running through one
 * near-monochrome ramp gives a player nothing to aim at. No landmark says which
 * end is the dark end, so sorting is guesswork rather than judgement.
 *
 * The fix turns out to be mostly recovery rather than invention. Measuring the
 * shipped artworks, every one already carries two opposed hue directions --
 * cool blue-violet down at the dark end, warm gold up at the light end, spread
 * 156 to 180 degrees apart. Those tones are invisible for two reasons, and both
 * are fixable:
 *
 *   1. Chroma sits around 0.01 to 0.15. At 0.01 a colour simply reads as grey.
 *   2. The ends sit at lightness 0.15 and 0.92, where the sRGB gamut is so
 *      narrow that chroma cannot exist there even in principle. The palette had
 *      put its two hue families exactly where they could not be seen.
 *
 * So: pull the lightness range in off black and white to give colour somewhere
 * to live, push the chroma up to something visible, and let the two families
 * the artwork already has land at opposite ends of the sort.
 */

export const TONE_TUNING = {
  /**
   * Lightness the ramp spans, rather than whatever the image happened to.
   * Wide enough that the ends read as clearly dark and clearly light, narrow
   * enough that both can still hold real chroma -- near 0 and near 1 the sRGB
   * gamut pinches to nothing and any hue there is wasted.
   */
  minLightness: 0.3,
  maxLightness: 0.84,

  /**
   * Chroma a board aims for, scaled by how vivid its artwork actually is.
   *
   * A single fixed target made every board come out equally saturated, which
   * erased the difference between a near-monochrome galaxy and a vivid black
   * hole -- their ramps came out nearly the same colours. The floor is what
   * makes the tones visible at all; the slope is what keeps each artwork
   * sounding like itself.
   */
  minChroma: 0.09,
  maxChroma: 0.16,
  chromaFromSource: 0.4,
  /**
   * How much the target relaxes toward the lightness ends, where less chroma is
   * available. Without this the fit does the tapering anyway, but unevenly.
   * Kept small: the ends are where the ramp should be at its most vivid, so
   * that the further a tile sits from the middle the stronger its colour.
   */
  endChromaFalloff: 0.2,

  /**
   * Chroma at a family boundary, as a fraction of the ramp's peak, and how much
   * of the ramp the fade spans.
   *
   * This is what gives the middle of the board something to say. Two families
   * meeting at full chroma is a cliff -- ten near-identical indigos, ten
   * near-identical golds, and no way to tell which indigo is the last one. So
   * chroma eases down to a muted tint at the seam and back up, and the hue
   * changes exactly where colour is weakest, which is why no alien in-between
   * hue is ever visible: the tiles either side of the seam read as a dusty blue
   * and a soft tan rather than as magenta.
   *
   * It also gives the sort a second cue. Inside a block, lightness alone steps
   * about 0.03 a tile, which is near the limit of what anyone can order by eye;
   * now saturation rises as well the further a tile sits from the middle.
   */
  seamChroma: 0.34,
  seamWidth: 0.34,

  /** Two hue centres closer than this are the same tone as far as a player is concerned. */
  minHueSeparation: 40,

  /**
   * A cluster below this chroma has no reliable hue to read off it.
   * Deliberately low: a faint hue is weak evidence, but it is still the
   * artwork's own, and using it beats inventing one. Saturn's dark background
   * sits at 0.006 chroma and is genuinely blue; at a stricter threshold it was
   * discarded and a hue got fabricated in its place.
   */
  usableChroma: 0.005,
  /** Invented partner hue sits this far around the wheel from the one real hue. */
  inventedHueOffset: 165,
  /**
   * Families to invent up to. Two, and no further: the point of inventing is to
   * guarantee the ends differ, and a third fabricated hue buys nothing the
   * artwork asked for. A requested tone count is a ceiling, not a quota.
   */
  minFamilies: 2,
} as const;

/**
 * A two-colour board is a *plane*, not a longer ramp: lightness down one axis,
 * hue across the other. These tune the hue axis.
 *
 * Sizing it is a question about people, not about Oklab. At fixed lightness and
 * chroma the Oklab hue circle is an actual circle, so the distance between two
 * hues is the chord `2 * C * sin(dh / 2)` -- which depends only on the size of
 * the step, not on where round the wheel it sits. Equal degrees are therefore
 * already equal delta-E, and "spacing by delta-E" would be the same operation
 * under a longer name. What is left to decide is how wide the arc is, and that
 * follows from the step each column should carry.
 *
 * Human hue discrimination is *not* uniform round the wheel, though, which is
 * the part Oklab does not capture: it is sharpest around yellow-orange and
 * dullest around blue-indigo. So an arc sitting in the blue is widened to buy
 * back the same perceived step, rather than the board being nudged towards
 * yellow -- the hue is assigned per category to keep boards distinct from each
 * other, and moving it would undo that.
 */
export const ARC_TUNING = {
  /**
   * Oklab distance each column should differ from the next.
   *
   * The scale comes from the Farnsworth-Munsell 100 hue test, which is this
   * exact task -- caps at constant lightness and chroma, ordered by hue. Its
   * caps sit about 4.2 degrees apart and observers with normal colour vision
   * score 0 to 128 errors on it, not zero. So the clinical threshold is a floor
   * to clear by a wide margin, not a target: this lands around 30 degrees a
   * column, roughly seven times that spacing, and comfortably over the board's
   * own legibility floor of 0.04.
   */
  hueStepDeltaE: 0.045,
  /** Extra arc, as a fraction, where hue discrimination is at its worst. */
  blueWidening: 0.35,
  /** Hue where discrimination is sharpest, and the widening is zero. */
  sharpestHue: 90,
  /** Below this the two ends do not read as two colours at all. */
  minArc: 55,
  /** Above this the ends stop reading as related and it is a rainbow again. */
  maxArc: 175,
  /**
   * Lightness a plane spans -- narrower than the ramp's 0.30-0.84.
   *
   * Both ends of the full range are where the sRGB gamut pinches to nothing, so
   * holding one chroma across a wide hue arc *and* the full lightness range
   * leaves about 0.05 chroma, too little for the hue axis to clear the
   * legibility floor. The lightness axis has slack the hue axis does not, so it
   * gives some up: over this range a plane holds around 0.077 chroma flat, and
   * both axes land near 0.06 delta-E a step.
   */
  planeMinLightness: 0.44,
  planeMaxLightness: 0.78,
} as const;

export interface ToneFamily {
  /** Hue centre in degrees. */
  hue: number;
  /** Mean lightness of the anchors this came from; decides its place in the ramp. */
  sourceLightness: number;
  /** Chroma mass behind this hue; the largest is the board's dominant colour. */
  weight: number;
  /** True when nothing in the artwork supplied this hue. */
  invented: boolean;
}

/** Everything needed to sample a board's ramp: which hues, and how vivid. */
export interface ToneSpec {
  families: ToneFamily[];
  /** Peak chroma along the ramp, derived from the artwork's own vividness. */
  chroma: number;
}

export interface ToneRamp extends ToneSpec {
  /** Ordered dark to light. */
  stops: Oklab[];
}

const TAU = 360;

/** Shortest signed angle from a to b, in degrees. */
export function hueDelta(a: number, b: number): number {
  return ((((b - a) % TAU) + TAU + 180) % TAU) - 180;
}

/** Interpolate hue the short way around the wheel. */
export function mixHue(a: number, b: number, t: number): number {
  return (((a + hueDelta(a, b) * t) % TAU) + TAU) % TAU;
}

/**
 * Pick the hue families the ramp travels through.
 *
 * Ordered by the lightness of the anchors they came from, so a family the
 * artwork uses in its shadows ends up at the dark end of the sort. On all four
 * shipped subjects that puts cool at the bottom and warm at the top, which is
 * what the pictures themselves do.
 */
export function selectToneFamilies(anchors: readonly Oklab[], count: number): ToneFamily[] {
  const chromatic = anchors
    .map((a) => ({ ...oklabToOklch(a), lab: a }))
    .filter((c) => c.C >= TONE_TUNING.usableChroma);

  // Nothing chromatic at all: invent both ends off a neutral, so the board is
  // still sortable by tone rather than by lightness alone.
  if (chromatic.length === 0) {
    const meanL = anchors.reduce((s, a) => s + a.L, 0) / Math.max(1, anchors.length);
    return [
      { hue: 265, sourceLightness: meanL - 0.1, weight: 0, invented: true },
      {
        hue: 265 + TONE_TUNING.inventedHueOffset,
        sourceLightness: meanL + 0.1,
        weight: 0,
        invented: true,
      },
    ].slice(0, count);
  }

  // Group by hue, weighting each cluster's contribution by its chroma: a vivid
  // anchor says more about what colour the artwork is than a washed-out one.
  const families: { hue: number; weight: number; lightness: number }[] = [];
  for (const c of [...chromatic].sort((a, b) => b.C - a.C)) {
    const near = families.find(
      (f) => Math.abs(hueDelta(f.hue, c.h)) < TONE_TUNING.minHueSeparation,
    );
    if (near) {
      const total = near.weight + c.C;
      near.hue = mixHue(near.hue, c.h, c.C / total);
      near.lightness = (near.lightness * near.weight + c.L * c.C) / total;
      near.weight = total;
    } else {
      families.push({ hue: c.h, weight: c.C, lightness: c.L });
    }
  }

  // Strongest hues first, capped at what was asked for. Fewer real families
  // than requested is fine and common -- Saturn is essentially one warm hue
  // plus a blue background -- and two strong tones beat three where one is
  // made up.
  const realCount = Math.min(families.length, count);
  const chosen: ToneFamily[] = families.slice(0, realCount).map((f) => ({
    hue: f.hue,
    sourceLightness: f.lightness,
    weight: f.weight,
    invented: false,
  }));

  // Only ever invent to reach the two-tone minimum, so the ends still differ.
  if (chosen.length < Math.min(count, TONE_TUNING.minFamilies)) {
    const base = chosen[chosen.length - 1] as ToneFamily;
    const meanL = chromatic.reduce((s, c) => s + c.L, 0) / chromatic.length;
    chosen.push({
      weight: 0,
      hue: mixHue(base.hue, base.hue + TONE_TUNING.inventedHueOffset, 1),
      // Take whichever lightness end the real family is not using.
      sourceLightness: base.sourceLightness < meanL ? meanL + 0.2 : meanL - 0.2,
      invented: true,
    });
  }

  return chosen.sort((a, b) => a.sourceLightness - b.sourceLightness);
}

/**
 * Hue at ramp position t: each family owns an equal block of the ramp, and the
 * hue steps between blocks rather than sweeping through them.
 *
 * This was a smooth transition, and it was wrong. Interpolating between two
 * families 150 degrees apart means a handful of positions land mid-arc, and at
 * twelve to thirty tiles a "handful of positions" is *one tile*. Saturn came
 * out as nine indigo tiles, one magenta, one red, and nine gold. The magenta
 * and the red were a correct sample of a smooth function and they read, to the
 * person holding the phone, as two broken tiles.
 *
 * The tell is Black Hole, the one board where the arc looked deliberate: its
 * red is a real third *family*, so it gets ten tiles and reads as a group. A
 * hue that appears on one tile and nowhere else reads as a mistake however
 * smooth the function behind it is. Widening the band instead would spend the
 * whole board on the sweep and turn a two-tone sort into a rainbow, which is
 * the opposite of making it obvious which end is which.
 *
 * So the boundary is a step. Every tile belongs unambiguously to one family,
 * the board splits into groups you can pile up by eye, and the fine ordering
 * inside each group is lightness -- which is the actual rule of the game and
 * runs monotonically across the step untouched.
 *
 * A bare step was not enough on its own, though: ten near-identical indigos
 * meeting ten near-identical golds gives the middle of the board nothing to
 * say, and no way to tell which indigo is the last one. `chromaAt` fades
 * saturation toward a tint at the boundary, so the step lands where colour is
 * weakest and the tiles either side read as a dusty blue and a soft tan --
 * genuinely in-between, without either taking a hue that belongs to neither
 * family.
 */
export function hueAt(families: readonly ToneFamily[], t: number): number {
  if (families.length === 0) return 0;
  const clamped = Math.min(1, Math.max(0, t));
  const block = Math.min(families.length - 1, Math.floor(clamped * families.length));
  return (families[block] as ToneFamily).hue;
}

const smoothstep = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/**
 * Chroma at ramp position t: eased off where the gamut cannot hold it, and
 * faded toward neutral wherever one family gives way to the next.
 */
export function chromaAt(peak: number, t: number, families: readonly ToneFamily[]): number {
  // Distance from the middle of the ramp, 0 at centre and 1 at either end.
  const fromCentre = Math.abs(t - 0.5) * 2;
  const ends = 1 - TONE_TUNING.endChromaFalloff * fromCentre * fromCentre;

  let seam = 1;
  for (let i = 1; i < families.length; i++) {
    const distance = Math.abs(t - i / families.length) / (TONE_TUNING.seamWidth / 2);
    const eased =
      TONE_TUNING.seamChroma +
      (1 - TONE_TUNING.seamChroma) * smoothstep(Math.min(1, distance));
    seam = Math.min(seam, eased);
  }

  return peak * ends * seam;
}

/**
 * How saturated this board should be, from how saturated its artwork is.
 * Floored so faint originals still read, capped so vivid ones stay tasteful.
 */
export function toneChroma(anchors: readonly Oklab[]): number {
  const peak = Math.max(0, ...anchors.map((a) => oklabToOklch(a).C));
  return Math.min(
    TONE_TUNING.maxChroma,
    Math.max(TONE_TUNING.minChroma, TONE_TUNING.minChroma + TONE_TUNING.chromaFromSource * peak),
  );
}

/**
 * Choose the hues and the vividness for a board in one go.
 *
 * `hue` names the colour the board should come out, and exists because a
 * category has to hold twenty boards that do not repeat each other while each
 * one still only takes hues its own artwork contains -- see
 * `src/content/hues.ts`. It rotates the whole set rigidly so the dominant
 * family lands on it, which leaves the relationships between families intact:
 * two tones 150 degrees apart stay 150 degrees apart.
 */
export function planTones(
  anchors: readonly Oklab[],
  toneCount: number,
  hue?: number,
): ToneSpec {
  const families = selectToneFamilies(anchors, Math.max(1, toneCount));
  const chroma = toneChroma(anchors);
  if (hue === undefined || families.length === 0) return { families, chroma };

  const dominant = families.reduce((a, b) => (b.weight > a.weight ? b : a));
  const turn = hueDelta(dominant.hue, hue);
  return {
    families: families.map((f) => ({ ...f, hue: (((f.hue + turn) % 360) + 360) % 360 })),
    chroma,
  };
}

/**
 * The colour at position t along the ramp, 0 dark to 1 light.
 *
 * Built in OKLCH, so lightness, chroma and hue each move independently and hue
 * is an *angle*. That matters even now that hue steps rather than sweeps: a
 * blend between two near-complementary colours taken as a straight line in
 * Oklab passes through grey halfway, so any softening of the boundary in Oklab
 * would put a band of mud through the centre of every board and reintroduce
 * exactly the washed-out look this is meant to fix. Chroma is held across the
 * step instead, so both sides stay fully coloured right up to the seam.
 */
export function sampleToneRamp(spec: ToneSpec, t: number): Oklab {
  const clamped = Math.min(1, Math.max(0, t));
  const lch: Oklch = {
    L:
      TONE_TUNING.minLightness +
      (TONE_TUNING.maxLightness - TONE_TUNING.minLightness) * clamped,
    C: chromaAt(spec.chroma, clamped, spec.families),
    h: hueAt(spec.families, clamped),
  };
  // fitToGamut reduces chroma at fixed lightness and hue until it fits, which
  // is exactly the right concession: the sort is by lightness, so lightness is
  // the one thing that must not move.
  return fitToGamut(oklchToOklab(lch));
}

export function buildToneRamp(
  anchors: readonly Oklab[],
  toneCount: number,
  steps = 32,
): ToneRamp {
  const spec = planTones(anchors, toneCount);
  const stops = Array.from({ length: steps }, (_, i) =>
    sampleToneRamp(spec, steps === 1 ? 0 : i / (steps - 1)),
  );
  return { ...spec, stops };
}


/**
 * How much wider an arc has to be, here on the wheel, to carry the same
 * *perceived* step. 1 at yellow-orange where hue discrimination is sharpest,
 * rising towards blue where it is dullest.
 */
export function hueSensitivityPenalty(hue: number): number {
  const away = 1 - Math.cos((hue - ARC_TUNING.sharpestHue) * (Math.PI / 180));
  return 1 + (ARC_TUNING.blueWidening * away) / 2;
}

/** Lightnesses and hues a plane of this size will use, given an arc. */
function planeGrid(centreHue: number, arc: number, columns: number, rows: number) {
  const at = (a: number, b: number, n: number, i: number) =>
    n <= 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1);
  return {
    lightnesses: Array.from({ length: rows }, (_, i) =>
      at(ARC_TUNING.planeMinLightness, ARC_TUNING.planeMaxLightness, rows, i),
    ),
    hues: Array.from({ length: columns }, (_, i) => {
      const h = at(centreHue - arc / 2, centreHue + arc / 2, columns, i);
      return ((h % 360) + 360) % 360;
    }),
  };
}

/** The largest chroma every cell of this grid can hold, so none has to be clipped. */
function flatChroma(lightnesses: number[], hues: number[], cap: number): number {
  let lo = 0;
  let hi = cap;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const fits = lightnesses.every((L) =>
      hues.every((h) => inSrgbGamut(oklchToOklab({ L, C: mid, h }), 1e-4)),
    );
    if (fits) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface PlanePlan {
  centreHue: number;
  /** Degrees of hue the board spans. */
  arc: number;
  /** One chroma for the whole plane. Never clipped, so never varying. */
  chroma: number;
  /** Oklab distance between neighbouring columns, for reporting and tests. */
  hueStep: number;
}

/**
 * Choose the arc and the chroma for a two-colour board together, because
 * neither can be picked first.
 *
 * They pull against each other. A wide arc needs some hue in it to survive the
 * narrow parts of the sRGB gamut, which caps the chroma; and a low chroma needs
 * a wider arc to reach the same perceptual step, because the step is the chord
 * `2 * C * sin(dh / 2)`. Solving one at a time spirals. So this scans candidate
 * arcs, works out the chroma each one actually allows, and takes the narrowest
 * that reaches the target step -- falling back to whichever gets furthest.
 *
 * The chroma is flat across the entire plane, and that is the point of doing it
 * this way rather than letting `fitToGamut` clip each cell. Clipping varies
 * chroma with lightness and hue, and because saturated colours read as lighter
 * than they measure (Helmholtz-Kohlrausch, which Oklab does not model), varying
 * chroma is varying *perceived* lightness -- a wobble laid over the axis whose
 * whole job is to rise cleanly. Constant chroma is also what the
 * Farnsworth-Munsell hue test holds fixed, for the same reason.
 */
export function planHuePlane(
  centreHue: number,
  columns: number,
  rows: number,
  chromaCap: number,
): PlanePlan {
  const gaps = Math.max(1, columns - 1);
  const wanted = ARC_TUNING.hueStepDeltaE * hueSensitivityPenalty(centreHue);

  let best: PlanePlan | null = null;
  for (let arc = ARC_TUNING.minArc; arc <= ARC_TUNING.maxArc; arc += 5) {
    const { lightnesses, hues } = planeGrid(centreHue, arc, columns, rows);
    const chroma = flatChroma(lightnesses, hues, chromaCap);
    const hueStep = 2 * chroma * Math.sin(((arc / gaps) * (Math.PI / 180)) / 2);
    const plan = { centreHue, arc, chroma, hueStep };
    if (!best || hueStep > best.hueStep) best = plan;
    // Narrowest arc that clears the target wins: a wider one only spends hue
    // the board does not need, and starts reading as a rainbow.
    if (hueStep >= wanted) return plan;
  }
  return best as PlanePlan;
}

/**
 * A cell of a two-colour board: hue from `x`, lightness from `y`.
 *
 * The lightness range is narrower than a one-colour board's, and deliberately.
 * A plane has slack there -- its lightness step is comfortably above the
 * legibility floor even across a short range -- while the ends of the full
 * range are exactly where the gamut pinches and the chroma the hue axis depends
 * on disappears. Trading lightness the board does not need for chroma it does
 * is what lets both axes clear the floor at once.
 */
export function sampleHuePlane(plan: PlanePlan, x: number, y: number): Oklab {
  const across = Math.min(1, Math.max(0, x));
  const down = Math.min(1, Math.max(0, y));
  const h = plan.centreHue - plan.arc / 2 + plan.arc * across;
  // fitToGamut must be a no-op here: `planHuePlane` already chose a chroma every
  // cell of the grid can hold. It stays as a guard for a caller sampling
  // positions off the grid, and a test pins the chroma flat on a real board so
  // this cannot start silently clipping.
  return fitToGamut(
    oklchToOklab({
      L:
        ARC_TUNING.planeMinLightness +
        (ARC_TUNING.planeMaxLightness - ARC_TUNING.planeMinLightness) * down,
      C: plan.chroma,
      h: ((h % 360) + 360) % 360,
    }),
  );
}
