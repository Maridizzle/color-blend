import { PuzzleSession } from '../game/session';
import { preparePuzzle } from '../game/prepare';
import { isTwoColour } from '../puzzle/difficulty';
import { prefersReducedMotion, recordFact, recordSolved, loadSettings } from '../game/persistence';
import type { Category, Subject } from '../content/types';
import { passageFor } from '../game/story';
import { button, clear, el, withSheen } from './dom';
import { talePassage } from './tale';

export interface PuzzleScreenHost {
  goBack(): void;
  openSubject(categoryId: string, subjectId: string): void;
  refreshProgress(): void;
}

/**
 * The puzzle screen: board, HUD, fact toasts, and the reveal panel.
 *
 * Owns the DOM around the board; the session owns the board itself. Kept apart
 * so the game loop never has to know how the page is laid out.
 */
/**
 * How long a two-colour board shows its solved state before scrambling.
 *
 * Long enough to take in the shape of the plane, short enough not to be a wait
 * on a board you are replaying. Skipped entirely under reduced motion, where an
 * unrequested animated change of the whole board is exactly what the setting is
 * asking not to happen.
 */
const PREVIEW_MS = 1400;

export function puzzleScreen(
  host: PuzzleScreenHost,
  category: Category,
  subject: Subject,
  index: number,
  /** The archive's position along the road, which sets the difficulty ramp. */
  roadIndex = 0,
): { element: HTMLElement; destroy: () => void } {
  const root = el('section', { class: 'screen screen-puzzle' });

  const title = el('h1', { class: 'puzzle-title', text: subject.title });
  const progressLabel = el('span', { class: 'stat', text: '0 / 0 placed' });
  const movesLabel = el('span', { class: 'stat', text: '0 moves' });
  const factsLabel = el('span', { class: 'stat stat-facts', text: '' });

  const header = el('header', {
    class: 'puzzle-header',
    children: [
      button('←', () => host.goBack(), 'button button-icon'),
      el('div', {
        class: 'puzzle-heading',
        children: [
          el('span', { class: 'puzzle-kicker', text: category.title }),
          title,
          el('div', {
            class: 'puzzle-stats',
            children: [progressLabel, movesLabel, factsLabel],
          }),
        ],
      }),
    ],
  });

  const canvas = el('canvas', {
    class: 'board',
    attrs: {
      tabindex: '0',
      role: 'application',
      'aria-label': `${subject.title}. Sort the tiles from darkest to lightest. Drag a tile onto another to swap them, or use arrow keys to move and Enter to pick up or place a tile.`,
    },
  });
  const boardWrap = el('div', {
    class: 'board-wrap',
    children: [
      canvas,
      el('div', { class: 'board-tracery', attrs: { 'aria-hidden': 'true' } }),
    ],
  });

  const status = el('p', {
    class: 'loading',
    text: `Reading the colors of ${subject.title}…`,
  });
  const toasts = el('div', {
    class: 'toasts',
    attrs: { 'aria-live': 'polite' },
  });

  const undoButton = button('Undo', () => session?.undo());
  const hintButton = button('Hint', () => {
    if (session && !session.hint()) flash('Nothing left to hint.');
  });
  const footer = el('footer', {
    class: 'puzzle-footer',
    children: [undoButton, hintButton],
  });

  root.append(header, status, boardWrap, toasts, footer);

  let session: PuzzleSession | null = null;
  let destroyed = false;
  const settings = loadSettings();
  const reducedMotion = prefersReducedMotion(settings);
  const factsFound = new Set<number>();
  let solvedMoves = 0;
  /** Fact tiles actually planted on this board; scales with its size. */
  let factTilesOnBoard = 0;
  /** Guards the one step from admiring the finished art to reading the passage. */
  let proceeded = false;
  let admireTimer: number | null = null;

  const onResize = () => session?.resize();
  window.addEventListener('resize', onResize);

  function flash(text: string): void {
    const toast = el('div', { class: 'toast toast-plain', text });
    toasts.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  function showFact(factIndex: number, text: string): void {
    factsFound.add(factIndex);
    recordFact(subject.id, factIndex);
    updateFactsLabel();

    const toast = el('div', {
      class: 'toast',
      children: [
        el('span', { class: 'toast-kicker', text: 'Did you know' }),
        el('p', { class: 'toast-body', text }),
      ],
    });
    toasts.appendChild(toast);
    // One at a time. Several tiles can land in quick succession near the end of
    // a board, and every card is a fixed panel sitting over the puzzle. This
    // allowed two, which on a twelve-tile board at phone width covers more than
    // half the tiles -- you cannot sort what you cannot see. One card still
    // hides a row, but the board stays legible around it, and the reveal panel
    // lists every fact at the end regardless, so nothing is lost by dropping
    // the older card early.
    while (toasts.childElementCount > 1) toasts.firstElementChild?.remove();

    // Long enough to actually read; this is the educational payload, not a nag.
    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 400);
    }, 6000);
  }

  function updateFactsLabel(): void {
    factsLabel.textContent =
      factTilesOnBoard > 0 ? `${factsFound.size} / ${factTilesOnBoard} facts` : '';
  }

  /**
   * The finished artwork, held whole on the board until the player chooses to
   * read on. This is the moment the whole game is building toward -- the picture
   * they assembled, entire -- so nothing covers it and nothing moves it along on
   * a timer. The passage panel waits behind a deliberate tap.
   */
  function admireArt(): void {
    root.classList.add('admiring');
    // The footer is gone now, so the board has the rest of the screen; refit the
    // art into the taller canvas so it sits centred and as large as it will go.
    session?.resize();

    const bar = el('div', {
      class: 'admire-bar',
      children: [
        el('span', { class: 'admire-hint', text: 'The folio is whole.' }),
        withSheen(button('Read on →', proceed, 'button button-primary admire-go')),
      ],
    });
    root.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('admire-bar-in'));

    // A few points of light around the picture, never on it, so nothing
    // competes with the art. Off with reduced motion, like the rest of the light.
    if (!reducedMotion) {
      const spots: [number, number, 'gold' | 'moon', number][] = [
        [9, 18, 'gold', 0], [88, 26, 'moon', 0.9], [82, 80, 'gold', 1.7], [12, 76, 'moon', 2.4],
        [50, 6, 'gold', 3.1], [6, 50, 'moon', 1.3], [93, 55, 'gold', 2.9],
      ];
      for (const [x, y, tone, delay] of spots) {
        boardWrap.appendChild(
          el('span', {
            class: `twinkle twinkle-${tone}`,
            attrs: { 'aria-hidden': 'true' },
            style: { left: `${x}%`, top: `${y}%`, '--d': `${delay}s` },
          }),
        );
      }
    }

    // Tapping the picture itself reads on too, but only after a beat: the tap
    // that skips the reveal animation lands on this same board, and without the
    // delay it would carry straight through and the player would never see the
    // whole image settle.
    admireTimer = window.setTimeout(() => {
      admireTimer = null;
      boardWrap.addEventListener('click', proceed);
    }, 500);
  }

  /** Leave the finished art and bring up the passage. Runs at most once. */
  function proceed(): void {
    if (proceeded) return;
    proceeded = true;
    if (admireTimer !== null) {
      clearTimeout(admireTimer);
      admireTimer = null;
    }
    boardWrap.removeEventListener('click', proceed);
    root.querySelector('.admire-bar')?.remove();
    boardWrap.querySelectorAll('.twinkle').forEach((spot) => spot.remove());
    root.classList.remove('admiring');
    showRevealPanel(solvedMoves);
  }

  /** The panel that slides up once the player leaves the finished artwork. */
  function showRevealPanel(moves: number): void {
    const nextIndex = index + 1;
    const next = category.subjects[nextIndex];
    const passage = passageFor(category, subject.id);

    const panel = el('div', {
      class: 'reveal-panel',
      children: [
        el('span', { class: 'reveal-sigil', attrs: { 'aria-hidden': 'true' }, text: '✦' }),
        el('span', { class: 'reveal-kicker', text: category.title }),
        el('h2', { class: 'reveal-title', text: subject.title }),
        el('div', { class: 'reveal-rule', attrs: { 'aria-hidden': 'true' } }),
        subject.blurb ? el('p', { class: 'reveal-blurb', text: subject.blurb }) : null,
        el('p', { class: 'reveal-moves', text: `Solved in ${moves} moves.` }),
        // Every fact, not just the ones found. Fact tiles are seeded, so a
        // replay serves the same ones and anything missed would otherwise be
        // unreachable -- on a twelve-tile board that would permanently hide
        // most of a subject. Finding one in play is the flourish; the full set
        // is the point.
        subject.facts.length > 0
          ? el('ul', {
              class: 'reveal-facts',
              children: subject.facts.map((fact, i) =>
                el('li', {
                  class: factsFound.has(i) ? 'reveal-fact-found' : undefined,
                  text: fact,
                }),
              ),
            })
          : null,
        factsFound.size > 0
          ? el('p', {
              class: 'reveal-hint',
              text: `You uncovered ${factsFound.size} of these while sorting.`,
            })
          : null,
        subject.attribution?.source || subject.attribution?.creator
          ? el('p', {
              class: 'reveal-attribution',
              text: [subject.attribution.creator, subject.attribution.source, subject.attribution.license]
                .filter(Boolean)
                .join(' · '),
            })
          : null,
        // The Archivist's scene: fiction, after the facts, in its own register.
        passage
          ? el('div', {
              class: 'reveal-tale',
              children: [
                el('span', { class: 'tale-kicker', text: 'The Archivist' }),
                talePassage({ paragraphs: passage }),
              ],
            })
          : null,
        el('div', {
          class: 'reveal-actions',
          children: [
            next
              ? withSheen(button(`Next: ${next.title}`, () => host.openSubject(category.id, next.id), 'button button-primary'))
              : withSheen(button('Back to category', () => host.goBack(), 'button button-primary')),
            next ? button('Back to category', () => host.goBack()) : null,
          ],
        }),
      ],
    });
    root.appendChild(panel);
    // Shrinking the board area re-fits the canvas so the artwork sits fully
    // above the panel instead of behind it.
    root.classList.add('revealed');
    session?.resize();
    // Next frame, so the transition actually runs rather than starting settled.
    requestAnimationFrame(() => panel.classList.add('reveal-panel-in'));
  }

  void (async () => {
    try {
      const prepared = await preparePuzzle(
        subject,
        index,
        category.subjects.length,
        category.id,
        roadIndex,
      );
      if (destroyed) return;

      status.remove();
      factTilesOnBoard = prepared.puzzle.factCells.length;
      updateFactsLabel();

      session = new PuzzleSession(
        canvas,
        prepared.puzzle,
        prepared.artwork,
        subject,
        { reducedMotion, lightnessAssist: settings.lightnessAssist, lit: !reducedMotion },
        {
          onFact: showFact,
          onProgress: (correct, total, moves) => {
            progressLabel.textContent = `${correct} / ${total} placed`;
            movesLabel.textContent = `${moves} ${moves === 1 ? 'move' : 'moves'}`;
          },
          onSolved: (moves) => {
            solvedMoves = moves;
            recordSolved(subject.id, moves);
            host.refreshProgress();
            undoButton.disabled = true;
            hintButton.disabled = true;
            // Get the toasts out of the way of the artwork; the reveal panel
            // later lists every fact found anyway.
            clear(toasts);
            // Let an impatient player skip the animation straight to the whole
            // picture. It still waits there for them to read on.
            canvas.addEventListener('pointerdown', () => session?.skipReveal(), { once: true });
          },
          onRevealDone: () => admireArt(),
        },
      );
      canvas.focus({ preventScroll: true });

      // Two-colour boards open with a look at the finished plane. A player can
      // infer a one-colour board's target from the rule alone -- darkest to
      // lightest -- but a plane has a hue axis as well, and no amount of
      // staring at a shuffle tells you where its ends are. Showing it first
      // turns the puzzle into putting back what you just saw, which is how the
      // genre makes its hardest boards fair rather than merely hard.
      if (isTwoColour(prepared.spec.difficulty) && !reducedMotion) {
        session.preview(PREVIEW_MS);
        flash('Remember this.');
      }
    } catch (error) {
      status.className = 'loading loading-error';
      status.textContent = (error as Error).message;
      status.appendChild(el('br'));
      status.appendChild(button('Back', () => host.goBack()));
    }
  })();

  return {
    element: root,
    destroy: () => {
      destroyed = true;
      if (admireTimer !== null) clearTimeout(admireTimer);
      window.removeEventListener('resize', onResize);
      session?.destroy();
      clear(root);
    },
  };
}
