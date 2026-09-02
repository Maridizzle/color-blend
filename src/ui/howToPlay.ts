import { oklabToHex, oklchToOklab } from '../color/oklab';
import { TONE_TUNING, ARC_TUNING } from '../color/tones';
import { fitToGamut } from '../color/gamut';
import { DIFFICULTY_TUNING } from '../puzzle/difficulty';
import { el } from './dom';

/**
 * How to play.
 *
 * Written as swatches rather than prose wherever it can be. "Sort them darkest
 * to lightest" is a sentence anyone can misread; a row of eight tiles running
 * dark to light is not. Every example here is generated from the same constants
 * the boards use -- `TONE_TUNING`'s lightness window, `ARC_TUNING`'s plane --
 * so the instructions cannot drift out of date with the game the way a
 * screenshot would.
 */

const EXAMPLE_TILES = 7;

function swatch(hex: string, extra = ''): HTMLElement {
  return el('span', { class: `demo-tile ${extra}`.trim(), style: { background: hex } });
}

/** A one-colour row, which is what easy and medium boards are. */
function rampRow(hue: number, count = EXAMPLE_TILES): HTMLElement {
  const tiles = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const L =
      TONE_TUNING.minLightness + (TONE_TUNING.maxLightness - TONE_TUNING.minLightness) * t;
    return swatch(oklabToHex(fitToGamut(oklchToOklab({ L, C: 0.115, h: hue }))));
  });
  return el('div', { class: 'demo-row', children: tiles });
}

/** A miniature of the two-colour plane: hue across, lightness down. */
function planeGrid(centreHue: number, cols = 4, rows = 4): HTMLElement {
  const arc = 120;
  const chroma = 0.075;
  const cells: HTMLElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const L =
        ARC_TUNING.planeMinLightness +
        ((ARC_TUNING.planeMaxLightness - ARC_TUNING.planeMinLightness) * r) / (rows - 1);
      const h = centreHue - arc / 2 + (arc * c) / (cols - 1);
      cells.push(swatch(oklabToHex(fitToGamut(oklchToOklab({ L, C: chroma, h })))));
    }
  }
  return el('div', {
    class: 'demo-grid',
    style: { '--demo-cols': String(cols) },
    children: cells,
  });
}

function section(title: string, body: (HTMLElement | null)[]): HTMLElement {
  return el('section', {
    class: 'how-section',
    children: [el('h2', { class: 'how-title', text: title }), ...body],
  });
}

const p = (text: string) => el('p', { class: 'how-text', text });

export function howToPlayContent(): HTMLElement {
  const { easy, hard } = DIFFICULTY_TUNING.tileCount;

  return el('div', {
    class: 'how',
    children: [
      section('The idea', [
        p(
          'Every puzzle is a picture broken into tiles and shuffled. Put the tiles back in order and the picture is revealed.',
        ),
        p('There is no timer and no score. Nothing is lost by taking a while.'),
      ]),

      section('Sorting', [
        p('Tiles run from darkest to lightest. That is the whole rule.'),
        rampRow(56),
        p(
          `Tap one tile, then tap another, and they swap. Or drag one onto the other. A board is ${easy} tiles at its smallest and ${hard} at its largest.`,
        ),
      ]),

      section('The tiles that will not move', [
        el('div', {
          class: 'demo-row',
          children: [
            swatch(oklabToHex(fitToGamut(oklchToOklab({ L: 0.34, C: 0.11, h: 56 }))), 'demo-locked'),
            swatch(oklabToHex(fitToGamut(oklchToOklab({ L: 0.5, C: 0.115, h: 56 })))),
            swatch(oklabToHex(fitToGamut(oklchToOklab({ L: 0.66, C: 0.115, h: 56 })))),
            swatch(oklabToHex(fitToGamut(oklchToOklab({ L: 0.82, C: 0.1, h: 56 }))), 'demo-locked'),
          ],
        }),
        p(
          'A tile with a ring on it is already home and is fixed there. They are given to you free, and they are where the order starts and ends.',
        ),
      ]),

      section('Harder boards have two colours', [
        p(
          'On the hardest puzzles the colour changes across the board as well as down it. Lightness still runs one way; hue runs the other.',
        ),
        planeGrid(20),
        p(
          'So each tile has two things to read rather than one, and both have to agree before it is home. All four corners are given to you, because they are what fix the ends of both directions.',
        ),
        p(
          'These boards show you the finished picture for a moment before they shuffle. Look at it — that is what you are putting back.',
        ),
      ]),

      section('If you get stuck', [
        p(
          'Hint moves one tile towards where it belongs. Undo takes back your last swap. Neither is limited and neither is cheating.',
        ),
        p(
          'Where two tiles are too close in shade to tell apart, either one counts. You will never be asked to see a difference that is not there.',
        ),
      ]),

      section('Facts', [
        p(
          'Some tiles, unmarked, hold a fact about the subject. It appears when that tile lands in the right place. Everything you find is kept in the Journal, and the rest are listed when the picture is revealed.',
        ),
      ]),

      section('If colour is hard to read', [
        p(
          'The task is ordering by lightness, and lightness ordering survives colour blindness. Settings has a Lightness assist that draws a bar on each tile showing how light it is, which makes every board playable without using hue at all.',
        ),
        p('Arrow keys move between tiles and Enter picks up and places, if you would rather not tap.'),
      ]),
    ],
  });
}
