import type { Category } from '../content/types';
import type { Progress } from '../game/persistence';
import { cellOwners, collectionState } from '../game/story';
import { el } from './dom';
import { roman } from './numerals';

/**
 * The road: every collection at once, as stations along a way.
 *
 * A list of categories says how many there are. A road says where you are on
 * it, and that it carries on past the last station -- which is what the story
 * needs, since the Archivist's work is never finished. Each station reuses the
 * arched reliquary card and shows a miniature of its mosaic in the arch, so the
 * road itself shows the pictures assembling as you play.
 *
 * Nothing here is authored per collection: a pack loaded from a zip gets a
 * station like any other, at the end of the road.
 */
export function roadScreen(
  categories: readonly Category[],
  progress: Progress,
  onOpen: (categoryId: string) => void,
): HTMLElement {
  let held = 0;
  let all = 0;

  const stations = categories.map((category, index) => {
    const state = collectionState(category, progress, categories);
    const total = category.subjects.length;
    held += state.solvedCount;
    all += total;
    const percent = total === 0 ? 0 : Math.round((state.solvedCount / total) * 100);

    // The miniature: one cell per mosaic piece, coloured with its board's own
    // hue once that piece is held. Colour rather than artwork, because at this
    // size a picture is mush and a colour is a signal.
    const owners = cellOwners(state.plan);
    const cells: HTMLElement[] = [];
    for (let cell = 0; cell < state.plan.cols * state.plan.rows; cell++) {
      const subject = category.subjects[owners[cell] ?? 0];
      const isHeld = state.uncovered.has(cell);
      cells.push(
        el('span', {
          class: `mosaic-mini-cell${isHeld ? ' held' : ''}`,
          style: isHeld ? { '--h': String(subject?.hue ?? 0) } : undefined,
        }),
      );
    }

    return el('li', {
      class: `station${index % 2 === 1 ? ' station-right' : ''}${state.complete ? ' station-complete' : ''}`,
      children: [
        el('span', { class: 'station-node', attrs: { 'aria-hidden': 'true' } }),
        el('button', {
          class: 'card category-card station-card',
          attrs: { type: 'button', 'aria-label': `${category.title}, ${state.solvedCount} of ${total} collected` },
          on: { click: (() => onOpen(category.id)) as never },
          children: [
            el('div', {
              class: 'category-illumination',
              style: { '--mosaic-cols': String(state.plan.cols), '--mosaic-rows': String(state.plan.rows) },
              attrs: { 'aria-hidden': 'true' },
              children: cells,
            }),
            el('div', {
              class: 'card-body station-body',
              children: [
                el('span', {
                  class: 'category-rose station-ring',
                  style: { '--ring': `${percent}%` },
                  attrs: { 'aria-hidden': 'true' },
                  children: [
                    el('span', { class: 'station-ring-face', text: state.complete ? '✦' : `${percent}%` }),
                  ],
                }),
                el('span', {
                  class: 'card-kicker station-kicker',
                  text: category.fromPack ? 'Visiting archive' : `Archive ${roman(index + 1)}`,
                }),
                el('h2', { class: 'card-title station-title', text: category.title }),
                category.blurb ? el('p', { class: 'card-blurb station-blurb', text: category.blurb }) : null,
                el('p', {
                  class: 'card-meta station-meta',
                  text: state.complete
                    ? `Whole · ${total} folios · the archive closed`
                    : state.solvedCount === 0
                      ? `0 of ${total} folios · nothing held yet`
                      : `${state.solvedCount} of ${total} folios · ${state.uncovered.size} pieces held`,
                }),
              ],
            }),
          ],
        }),
      ],
    });
  });

  return el('div', {
    class: 'road',
    children: [
      el('p', {
        class: 'road-legend',
        text:
          held === 0
            ? 'The road runs on past the last of these. It always will.'
            : `${held} of ${all} folios collected, and the road runs on past the last of these.`,
      }),
      el('ol', {
        class: 'road-line',
        children: [...stations, el('span', { class: 'road-onward', text: 'and on, past these…' })],
      }),
    ],
  });
}
