import { oklabToHex, oklchToOklab } from '../color/oklab';
import { TONE_TUNING } from '../color/tones';
import { fitToGamut } from '../color/gamut';
import { el } from './dom';

/**
 * The opening titles, and the brief cards between screens.
 *
 * Both exist for the same reason: a game that drops you straight into a grid of
 * shades with no preamble reads as a tech demo. A moment of nothing-to-do at
 * the start is what tells you the thing has been made rather than generated.
 *
 * The splash is not a logo on a colour. It is eight tiles that arrive scrambled
 * and sort themselves, which is the entire game played once in a second and a
 * half -- and it is built from the real ramp, `TONE_TUNING`'s own lightness
 * window sampled at a real hue, so what you see on the title card is what the
 * boards are made of.
 */

export const INTRO_TIMING = {
  /** Beat before the tiles sort, so the scramble registers as a scramble. */
  settleMs: 450,
  /** How long the sort itself takes. Matches the CSS transition. */
  sortMs: 1100,
  /** Total time on screen before it fades, unless tapped away first. */
  holdMs: 2300,
  /** The little card when you open a category. */
  flashMs: 900,
  /** Hue the title tiles run through; gold, to sit with the shell's own metal. */
  hue: 84,
} as const;

/** A single-hue ramp of `count` swatches, built the way a board is. */
export function titleRamp(count: number, hue = INTRO_TIMING.hue): string[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const L =
      TONE_TUNING.minLightness + (TONE_TUNING.maxLightness - TONE_TUNING.minLightness) * t;
    return oklabToHex(fitToGamut(oklchToOklab({ L, C: 0.11, h: hue })));
  });
}

/**
 * Deterministic derangement: every tile starts somewhere it does not belong.
 *
 * A random shuffle can leave swatches in place, and on eight tiles that happens
 * often enough to matter -- a title card that opens half-sorted looks like a
 * bug rather than a scramble.
 *
 * This interleaves the light half back through the dark half, which has two
 * properties worth having. It alternates dark and light, so it reads as
 * thoroughly mixed rather than merely shifted; and it has no fixed point for
 * any length. A value taken from the light half lands at an even position `p`
 * and would have to equal `p` to stay put, which needs `p` to be twice the
 * half-length -- past the end of the row. A value from the dark half lands at
 * an odd position, always ahead of its own index. Neither can happen.
 *
 * The first attempt at this was `(i * 3 + 1) % n`, which is a permutation only
 * when the length is not a multiple of three. At eight tiles it was fine and at
 * three it collapsed every tile onto the same one. A test found it.
 */
export function derange<T>(items: readonly T[]): T[] {
  if (items.length < 2) return [...items];
  const half = Math.ceil(items.length / 2);
  const dark = items.slice(0, half);
  const light = items.slice(half);

  const out: T[] = [];
  for (let i = 0; i < half; i++) {
    if (i < light.length) out.push(light[i] as T);
    out.push(dark[i] as T);
  }
  return out;
}

export interface Dismissable {
  element: HTMLElement;
  destroy: () => void;
}

/**
 * The title card. Resolves when it has finished or been tapped away, so the
 * caller can wait for it without knowing how it is built.
 */
export function introSplash(reducedMotion: boolean, onDone: () => void): Dismissable {
  const sorted = titleRamp(8);
  const tiles = derange(sorted).map((hex) =>
    el('span', { class: 'intro-tile', style: { background: hex } }),
  );

  const root = el('div', {
    class: 'intro',
    attrs: { role: 'presentation' },
    children: [
      el('div', { class: 'intro-tiles', children: tiles }),
      el('p', { class: 'intro-kicker', text: 'The Chromatic Reliquary' }),
      el('h1', { class: 'intro-logo', text: 'Color Blend' }),
      // Half of the home screen's line. The title card is the short version of
      // the same sentence, not a second, competing one.
      el('p', { class: 'intro-tagline', text: 'Order the living shades. Unseal the image.' }),
    ],
  });

  let done = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const finish = () => {
    if (done) return;
    done = true;
    for (const t of timers) clearTimeout(t);
    root.classList.add('intro-out');
    // Let the fade play, but do not make the caller wait on it if motion is off.
    timers.push(setTimeout(onDone, reducedMotion ? 0 : 320));
  };

  root.addEventListener('pointerdown', finish);
  root.addEventListener('keydown', finish);

  if (reducedMotion) {
    // No sort to watch, so show it already sorted and hold briefly.
    tiles.forEach((tile, i) => tile.style.setProperty('background', sorted[i] as string));
    root.classList.add('intro-still');
    timers.push(setTimeout(finish, INTRO_TIMING.holdMs));
  } else {
    timers.push(
      setTimeout(() => {
        root.classList.add('intro-sorted');
        tiles.forEach((tile, i) => tile.style.setProperty('background', sorted[i] as string));
      }, INTRO_TIMING.settleMs),
    );
    timers.push(setTimeout(finish, INTRO_TIMING.holdMs));
  }

  return { element: root, destroy: finish };
}

/**
 * The card that flashes a category's name before its list.
 *
 * Short enough to be punctuation rather than a wait, and tappable away. It also
 * covers the moment the list is being built, which on a phone is the difference
 * between "opened" and "hesitated".
 */
export function categoryFlash(
  title: string,
  blurb: string | undefined,
  reducedMotion: boolean,
  onDone: () => void,
): Dismissable {
  const root = el('div', {
    class: 'flash',
    attrs: { role: 'presentation' },
    children: [
      el('div', {
        class: 'flash-swatches',
        children: titleRamp(5).map((hex) =>
          el('span', { class: 'flash-swatch', style: { background: hex } }),
        ),
      }),
      el('h2', { class: 'flash-title', text: title }),
      blurb ? el('p', { class: 'flash-blurb', text: blurb }) : null,
    ],
  });

  let done = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const finish = () => {
    if (done) return;
    done = true;
    for (const t of timers) clearTimeout(t);
    root.classList.add('flash-out');
    timers.push(setTimeout(onDone, reducedMotion ? 0 : 220));
  };

  root.addEventListener('pointerdown', finish);
  timers.push(setTimeout(finish, reducedMotion ? 260 : INTRO_TIMING.flashMs));
  return { element: root, destroy: finish };
}
