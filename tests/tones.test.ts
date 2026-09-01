import { describe, expect, it } from 'vitest';
import { type Oklab, inSrgbGamut, oklabToOklch, oklchToOklab, rgbToOklab } from '../src/color/oklab';
import {
  TONE_TUNING,
  buildToneRamp,
  hueAt,
  hueDelta,
  mixHue,
  planTones,
  sampleToneRamp,
  selectToneFamilies,
  toneChroma,
} from '../src/color/tones';

/** An anchor at a given hue, chroma and lightness. */
const at = (L: number, C: number, h: number): Oklab => oklchToOklab({ L, C, h });

/** The shipped artworks' shape: faint cool shadows, faint warm highlights. */
const FAINT_TWO_TONE = [at(0.16, 0.01, 268), at(0.38, 0.03, 271), at(0.92, 0.05, 87)];

describe('hue arithmetic', () => {
  it('takes the short way around the wheel', () => {
    expect(hueDelta(350, 10)).toBeCloseTo(20, 6);
    expect(hueDelta(10, 350)).toBeCloseTo(-20, 6);
    expect(mixHue(350, 10, 0.5)).toBeCloseTo(0, 6);
  });

  it('stays in 0..360', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const h = mixHue(350, 10, t);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});

describe('tone families', () => {
  it('recovers the two hues a faint artwork already has', () => {
    // The whole premise: the tones are in the picture, just too weak to see.
    const families = selectToneFamilies(FAINT_TWO_TONE, 2);
    expect(families).toHaveLength(2);
    expect(families.every((f) => f.invented)).toBe(false);

    const hues = families.map((f) => Math.round(f.hue));
    expect(Math.abs(hueDelta(hues[0]!, hues[1]!))).toBeGreaterThan(120);
  });

  it('puts the artwork’s dark hue at the dark end', () => {
    // Cool shadows and warm highlights should sort cool-to-warm, because that
    // is what the picture itself does.
    const [dark, light] = selectToneFamilies(FAINT_TWO_TONE, 2);
    expect(dark!.sourceLightness).toBeLessThan(light!.sourceLightness);
    expect(Math.abs(hueDelta(dark!.hue, 270))).toBeLessThan(40);
    expect(Math.abs(hueDelta(light!.hue, 87))).toBeLessThan(40);
  });

  it('invents a partner only when the artwork has a single hue', () => {
    const oneHue = [at(0.3, 0.1, 30), at(0.6, 0.12, 35), at(0.8, 0.09, 25)];
    const families = selectToneFamilies(oneHue, 2);
    expect(families).toHaveLength(2);
    expect(families.filter((f) => f.invented)).toHaveLength(1);
    expect(Math.abs(hueDelta(families[0]!.hue, families[1]!.hue))).toBeGreaterThan(90);
  });

  it('never invents beyond the two-tone minimum', () => {
    // A requested tone count is a ceiling, not a quota: three tones where only
    // two are real would be two-thirds artwork and one-third fabrication.
    const oneHue = [at(0.3, 0.1, 30), at(0.7, 0.12, 35)];
    const families = selectToneFamilies(oneHue, 3);
    expect(families.filter((f) => f.invented).length).toBeLessThanOrEqual(1);
    expect(families.length).toBeLessThanOrEqual(TONE_TUNING.minFamilies);
  });

  it('uses three real hues when the artwork supplies them', () => {
    const three = [at(0.25, 0.1, 280), at(0.5, 0.14, 20), at(0.85, 0.1, 90)];
    const families = selectToneFamilies(three, 3);
    expect(families).toHaveLength(3);
    expect(families.every((f) => f.invented)).toBe(false);
  });

  it('handles a fully neutral palette without crashing', () => {
    const grey = [at(0.2, 0, 0), at(0.5, 0, 0), at(0.8, 0, 0)];
    const families = selectToneFamilies(grey, 2);
    expect(families).toHaveLength(2);
    expect(families.every((f) => f.invented)).toBe(true);
  });
});

describe('the ramp', () => {
  const spec = planTones(FAINT_TWO_TONE, 2);

  it('runs monotonically dark to light', () => {
    let previous = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const { L } = oklabToOklch(sampleToneRamp(spec, i / 20));
      expect(L).toBeGreaterThan(previous);
      previous = L;
    }
  });

  it('sits inside a lightness window where colour can exist', () => {
    // Both ends off black and white, which is where the shipped palettes had
    // parked their two hue families and made them invisible.
    const dark = oklabToOklch(sampleToneRamp(spec, 0));
    const light = oklabToOklch(sampleToneRamp(spec, 1));
    expect(dark.L).toBeCloseTo(TONE_TUNING.minLightness, 5);
    expect(light.L).toBeCloseTo(TONE_TUNING.maxLightness, 5);
  });

  it('keeps every stop visibly coloured', () => {
    // The actual fix. Source chroma here is 0.01-0.05, which reads as grey.
    for (let i = 0; i <= 20; i++) {
      const { C } = oklabToOklch(sampleToneRamp(spec, i / 20));
      expect(C, `stop ${i}`).toBeGreaterThan(0.05);
    }
  });

  it('has no grey midpoint between near-complementary hues', () => {
    // The trap this design exists to avoid. Interpolating two opposed hues as a
    // straight line in Oklab passes through grey at the midpoint, which would
    // put a band of mud through the centre of every board -- reintroducing the
    // exact washed-out look the tones are meant to fix. Going around the hue
    // wheel at held chroma avoids it.
    const opposed = planTones([at(0.3, 0.12, 270), at(0.8, 0.12, 90)], 2);
    for (const t of [0.4, 0.45, 0.5, 0.55, 0.6]) {
      const { C } = oklabToOklch(sampleToneRamp(opposed, t));
      expect(C, `midpoint ${t}`).toBeGreaterThan(0.08);
    }
  });

  it('stays inside sRGB everywhere', () => {
    for (const tones of [1, 2, 3]) {
      const s = planTones(FAINT_TWO_TONE, tones);
      for (let i = 0; i <= 32; i++) {
        expect(inSrgbGamut(sampleToneRamp(s, i / 32), 1e-3)).toBe(true);
      }
    }
  });

  it('holds each hue steady, then swings between families', () => {
    // Plateaus are what make the families read as groups rather than a smear,
    // so a player can sort coarsely first and refine after.
    const families = selectToneFamilies(FAINT_TWO_TONE, 2);
    const cool = families[0]!;
    const warm = families[families.length - 1]!;

    // Near each end the hue should barely move.
    expect(Math.abs(hueDelta(hueAt(families, 0), hueAt(families, 0.2)))).toBeLessThan(5);
    expect(Math.abs(hueDelta(hueAt(families, 0.8), hueAt(families, 1)))).toBeLessThan(5);
    // And each end should be its own family's hue.
    expect(Math.abs(hueDelta(hueAt(families, 0), cool.hue))).toBeLessThan(1);
    expect(Math.abs(hueDelta(hueAt(families, 1), warm.hue))).toBeLessThan(1);
    // The swing happens in between.
    expect(Math.abs(hueDelta(hueAt(families, 0.4), hueAt(families, 0.6)))).toBeGreaterThan(30);
  });

  it('scales vividness with the artwork rather than flattening every board', () => {
    // A fixed chroma target made a faint galaxy and a vivid black hole come out
    // as nearly the same ramp.
    const faint = toneChroma(FAINT_TWO_TONE);
    const vivid = toneChroma([at(0.2, 0.02, 280), at(0.55, 0.15, 0), at(0.9, 0.07, 85)]);
    expect(vivid).toBeGreaterThan(faint);
    expect(faint).toBeGreaterThanOrEqual(TONE_TUNING.minChroma);
    expect(vivid).toBeLessThanOrEqual(TONE_TUNING.maxChroma);
  });

  it('builds a ramp of the requested length', () => {
    const ramp = buildToneRamp(FAINT_TWO_TONE, 2, 12);
    expect(ramp.stops).toHaveLength(12);
    expect(ramp.families).toHaveLength(2);
    expect(ramp.chroma).toBeGreaterThan(0);
  });

  it('separates the two ends far enough to be unmistakable', () => {
    // The point of the exercise: whichever end you look at, you know which it is.
    const ends = [sampleToneRamp(spec, 0), sampleToneRamp(spec, 1)].map(rgbFrom);
    expect(ends[0]).not.toEqual(ends[1]);

    const dark = oklabToOklch(sampleToneRamp(spec, 0));
    const light = oklabToOklch(sampleToneRamp(spec, 1));
    expect(light.L - dark.L).toBeGreaterThan(0.4);
    expect(Math.abs(hueDelta(dark.h, light.h))).toBeGreaterThan(90);
  });
});

function rgbFrom(lab: Oklab): string {
  const { L, C, h } = oklabToOklch(lab);
  return `${L.toFixed(3)}/${C.toFixed(3)}/${h.toFixed(1)}`;
}

describe('regression: a real artwork palette', () => {
  it('turns the measured Spiral Galaxy palette into a visible two-tone board', () => {
    // Taken from the shipped artwork: hues 268/271/304/87 at chroma 0.01-0.05.
    const measured = [
      rgbToOklab({ r: 12, g: 13, b: 26 }),
      rgbToOklab({ r: 70, g: 72, b: 96 }),
      rgbToOklab({ r: 108, g: 104, b: 128 }),
      rgbToOklab({ r: 236, g: 233, b: 214 }),
    ];
    const sourcePeak = Math.max(...measured.map((m) => oklabToOklch(m).C));
    expect(sourcePeak).toBeLessThan(0.08); // genuinely washed out

    const spec = planTones(measured, 2);
    const boardPeak = Math.max(
      ...Array.from({ length: 21 }, (_, i) => oklabToOklch(sampleToneRamp(spec, i / 20)).C),
    );
    expect(boardPeak).toBeGreaterThan(sourcePeak * 1.5);
    expect(boardPeak).toBeGreaterThan(TONE_TUNING.minChroma * 0.9);
  });
});
