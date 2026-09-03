import type { ArtworkSource, Category } from '../content/types';
import type { Progress } from '../game/persistence';
import { cellOwners, collectionState } from '../game/story';
import { button, el } from './dom';
import { roman } from './numerals';
import { talePassage } from './tale';

/**
 * A collection's gallery: the mosaic, and the Archivist's account of it.
 *
 * The mosaic is a grid of cells over one image, uncovered a share at a time.
 * Cells are plain elements sharing a single background positioned per cell,
 * rather than a canvas, so an uncovering can be a CSS transition and the
 * picture stays crisp at any size without redrawing anything.
 *
 * When a collection carries no plate of its own -- which every pack loaded from
 * a zip does -- each cell shows the artwork of the puzzle that owns it instead.
 * The collection is then composed of the things collected, which is a fair
 * reading of the same idea and needs nothing authored.
 */

/** A CSS url() for an artwork, plus how to let it go again. */
function cssUrl(source: ArtworkSource | undefined): { url: string; revoke?: () => void } | null {
  if (!source) return null;
  if (source.kind === 'url') return { url: source.url };
  if (source.kind === 'bytes') {
    const blob = new Blob([source.bytes as BlobPart], { type: source.mime });
    const url = URL.createObjectURL(blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }
  return null;
}

export function galleryScreen(
  category: Category,
  progress: Progress,
  host: { onEnter: () => void; road: readonly Category[] },
): { element: HTMLElement; destroy: () => void } {
  const state = collectionState(category, progress, host.road);
  const { plan, tale } = state;
  const revokes: (() => void)[] = [];

  const plate = cssUrl(category.mosaic);
  if (plate?.revoke) revokes.push(plate.revoke);
  const owners = cellOwners(plan);

  const cells: HTMLElement[] = [];
  for (let cell = 0; cell < plan.cols * plan.rows; cell++) {
    const subject = category.subjects[owners[cell] ?? 0];
    const held = state.uncovered.has(cell);
    const col = cell % plan.cols;
    const row = Math.floor(cell / plan.cols);

    let className = 'mosaic-cell';
    const style: Record<string, string> = {};
    if (held) {
      className += ' mosaic-cell-held';
      const piece = plate ?? cssUrl(subject?.artwork);
      if (piece && piece !== plate && piece.revoke) revokes.push(piece.revoke);
      if (piece) {
        style['background-image'] = `url("${piece.url}")`;
        if (plate) {
          // One image behind the whole grid: scale it to grid size and slide
          // each cell to its own share of it.
          style['background-size'] = `${plan.cols * 100}% ${plan.rows * 100}%`;
          style['background-position'] =
            `${plan.cols > 1 ? (col / (plan.cols - 1)) * 100 : 50}% ${plan.rows > 1 ? (row / (plan.rows - 1)) * 100 : 50}%`;
        } else {
          style['background-size'] = 'cover';
          style['background-position'] = 'center';
        }
      } else {
        // Nothing drawable, so the board's own colour stands in for it.
        className += ' mosaic-cell-ramp';
        style['--h'] = String(subject?.hue ?? 0);
      }
    }

    cells.push(
      el('div', {
        class: className,
        style,
        attrs: {
          role: 'listitem',
          'aria-label': held ? `Held: ${subject?.title ?? 'a piece'}` : 'Not yet collected',
          title: held ? (subject?.title ?? '') : 'Not yet collected',
        },
        children: held ? [] : [el('span', { class: 'mosaic-sigil', text: '✦' })],
      }),
    );
  }

  const heldCount = state.uncovered.size;
  const totalCells = plan.cols * plan.rows;

  // The tale, as far as it has been unlocked. Sealed folios are shown as a row
  // of sigils, so it is clear how much story is still to come.
  const passages: (HTMLElement | null)[] = [];
  if (tale) {
    passages.push(talePassage({ paragraphs: tale.opening, cite: 'Opening', opening: true }));
    for (const { index, subjectTitle, entry } of state.passages) {
      passages.push(talePassage({ paragraphs: entry.passage, cite: `${roman(index + 1)} · ${subjectTitle}` }));
    }
    if (state.sealed > 0) {
      passages.push(
        el('p', {
          class: 'tale-sealed',
          children: [
            el('span', { text: Array.from({ length: state.sealed }, () => '✦').join(' ') }),
            document.createTextNode(` ${state.sealed} ${state.sealed === 1 ? 'folio' : 'folios'} sealed`),
          ],
        }),
      );
    }
    // The chapter's cliffhanger, once the whole chapter has been played.
    if (state.chapterClosing && state.chapter) {
      passages.push(
        talePassage({
          paragraphs: state.chapterClosing,
          cite: `End of Chapter ${roman(state.chapter.number)}`,
        }),
      );
    } else if (state.complete && state.chapter && !state.chapterClosing) {
      const left = state.chapter.collectionIds.filter((id) => {
        const c = host.road.find((r) => r.id === id);
        return c ? !c.subjects.every((s) => progress.solved[s.id]) : true;
      }).length;
      if (left > 0) {
        passages.push(
          el('p', {
            class: 'tale-waiting',
            text: `The chapter does not end here. ${left} more ${left === 1 ? 'archive' : 'archives'} before the Archivist closes it.`,
          }),
        );
      }
    }
  }

  const element = el('div', {
    class: 'gallery',
    children: [
      el('div', {
        class: 'mosaic',
        style: { '--mosaic-cols': String(plan.cols), '--mosaic-rows': String(plan.rows) },
        attrs: { role: 'list', 'aria-label': `${category.title} mosaic` },
        children: cells,
      }),
      el('p', {
        class: 'gallery-meta',
        text: state.complete
          ? `Whole · ${category.subjects.length} of ${category.subjects.length} folios, and the picture entire`
          : `${heldCount} of ${totalCells} pieces held · ${state.solvedCount} of ${category.subjects.length} folios`,
      }),
      el('div', {
        class: 'gallery-actions',
        children: [button('Enter the folios →', host.onEnter, 'button button-primary')],
      }),
      tale
        ? el('section', {
            class: 'tale',
            children: [
              el('h2', { class: 'tale-title', text: 'The Archivist' }),
              state.chapter
                ? el('span', {
                    class: 'tale-kicker',
                    text: `Chapter ${roman(state.chapter.number)} · ${state.chapter.title}`,
                  })
                : null,
              ...passages,
            ],
          })
        : el('p', {
            class: 'tale-waiting',
            text: 'The Archivist has not reached this archive yet. Its pieces are still yours to collect.',
          }),
    ],
  });

  return {
    element,
    destroy: () => {
      for (const revoke of revokes) revoke();
    },
  };
}
