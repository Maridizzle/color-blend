/**
 * Oklab / OKLCH color space.
 *
 * Every color decision in this game -- "is this tile darker than that one", "are
 * these two shades close enough to count as the same", "what sits halfway
 * between these anchors" -- has to match what a player actually perceives.
 * sRGB is badly non-uniform for all three, so the engine works in Oklab
 * throughout and only converts to sRGB at the moment of drawing.
 *
 * Matrices from Bjorn Ottosson's Oklab derivation.
 */

/** sRGB with components in 0..255. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Oklab. L is roughly 0..1; a and b are roughly -0.4..0.4. */
export interface Oklab {
  L: number;
  a: number;
  b: number;
}

/** Oklab in polar form. C is chroma (>= 0), h is hue in degrees 0..360. */
export interface Oklch {
  L: number;
  C: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** sRGB transfer function, 0..1 encoded -> 0..1 linear. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 0..1 linear -> 0..1 encoded sRGB. */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function rgbToOklab({ r, g, b }: Rgb): Oklab {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/** Oklab -> linear sRGB, unclamped. Components may fall outside 0..1. */
export function oklabToLinearRgb({ L, a, b }: Oklab): { r: number; g: number; b: number } {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** Oklab -> sRGB 0..255, clipped. Use `fitToGamut` first for a nicer clip. */
export function oklabToRgb(lab: Oklab): Rgb {
  const lin = oklabToLinearRgb(lab);
  return {
    r: Math.round(clamp(linearToSrgb(lin.r), 0, 1) * 255),
    g: Math.round(clamp(linearToSrgb(lin.g), 0, 1) * 255),
    b: Math.round(clamp(linearToSrgb(lin.b), 0, 1) * 255),
  };
}

/** True when the Oklab color has an exact sRGB representation. */
export function inSrgbGamut(lab: Oklab, epsilon = 1e-4): boolean {
  const { r, g, b } = oklabToLinearRgb(lab);
  const lo = -epsilon;
  const hi = 1 + epsilon;
  return r >= lo && r <= hi && g >= lo && g <= hi && b >= lo && b <= hi;
}

export function oklabToOklch({ L, a, b }: Oklab): Oklch {
  const C = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

export function oklchToOklab({ L, C, h }: Oklch): Oklab {
  const rad = (h * Math.PI) / 180;
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

/**
 * Perceptual distance between two colors: plain euclidean distance in Oklab,
 * which is what the space is built for. Rough intuition for the numbers used
 * elsewhere in the codebase: ~0.02 is a just-noticeable difference between two
 * large adjacent patches, ~0.10 is comfortably distinct, ~0.30 is a different
 * color entirely.
 */
export function deltaE(x: Oklab, y: Oklab): number {
  const dL = x.L - y.L;
  const da = x.a - y.a;
  const db = x.b - y.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** Linear interpolation in Oklab, which keeps midpoints perceptually sane. */
export function mix(x: Oklab, y: Oklab, t: number): Oklab {
  return {
    L: x.L + (y.L - x.L) * t,
    a: x.a + (y.a - x.a) * t,
    b: x.b + (y.b - x.b) * t,
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const h = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex: string): Rgb {
  const s = hex.replace('#', '');
  const full =
    s.length === 3
      ? s
          .split('')
          .map((c) => c + c)
          .join('')
      : s;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export const oklabToHex = (lab: Oklab): string => rgbToHex(oklabToRgb(lab));
