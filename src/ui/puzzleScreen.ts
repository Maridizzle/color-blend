import { PuzzleSession } from '../game/session';
import { preparePuzzle } from '../game/prepare';
import { prefersReducedMotion, recordFact, recordSolved, loadSettings } from '../game/persistence';
import type { Category, Subject } from '../content/types';
import { button, clear, el } from './dom';

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
export function puzzleScreen(
  host: PuzzleScreenHost,
  category: Category,
  subject: Subject,
  index: number,
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
      'aria-label': `${subject.title}. Sort the tiles from darkest to lightest. Use arrow keys to move and Enter to pick up or place a tile.`,
    },
  });
  const boardWrap = el('div', { class: 'board-wrap', children: [canvas] });

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
    // Two at a time. Several tiles can land in quick succession near the end of
    // a board, and a stack of five cards is a wall of text over the puzzle
    // rather than something anyone reads. The reveal panel lists them all anyway.
    while (toasts.childElementCount > 2) toasts.firstElementChild?.remove();

    // Long enough to actually read; this is the educational payload, not a nag.
    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 400);
    }, 6000);
  }

  function updateFactsLabel(): void {
    const total = Math.min(subject.facts.length, 5);
    factsLabel.textContent = total > 0 ? `${factsFound.size} / ${total} facts` : '';
  }

  /** The panel that slides up once the artwork has finished revealing itself. */
  function showRevealPanel(moves: number): void {
    const nextIndex = index + 1;
    const next = category.subjects[nextIndex];

    const panel = el('div', {
      class: 'reveal-panel',
      children: [
        el('span', { class: 'reveal-kicker', text: category.title }),
        el('h2', { class: 'reveal-title', text: subject.title }),
        subject.blurb ? el('p', { class: 'reveal-blurb', text: subject.blurb }) : null,
        el('p', { class: 'reveal-moves', text: `Solved in ${moves} moves.` }),
        factsFound.size > 0
          ? el('ul', {
              class: 'reveal-facts',
              children: [...factsFound]
                .sort((a, b) => a - b)
                .map((i) => el('li', { text: subject.facts[i] ?? '' })),
            })
          : null,
        subject.facts.length > factsFound.size && factsFound.size > 0
          ? el('p', {
              class: 'reveal-hint',
              text: 'Replay to uncover the facts you missed.',
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
        el('div', {
          class: 'reveal-actions',
          children: [
            next
              ? button(`Next: ${next.title}`, () => host.openSubject(category.id, next.id), 'button button-primary')
              : button('Back to category', () => host.goBack(), 'button button-primary'),
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
      const prepared = await preparePuzzle(subject, index);
      if (destroyed) return;

      status.remove();
      updateFactsLabel();

      session = new PuzzleSession(
        canvas,
        prepared.puzzle,
        prepared.artwork,
        subject,
        { reducedMotion, lightnessAssist: settings.lightnessAssist },
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
            // about to slide up lists every fact found anyway.
            clear(toasts);
            // Let an impatient player skip straight to the picture.
            canvas.addEventListener('pointerdown', () => session?.skipReveal(), { once: true });
          },
          onRevealDone: () => showRevealPanel(solvedMoves),
        },
      );
      canvas.focus({ preventScroll: true });
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
      window.removeEventListener('resize', onResize);
      session?.destroy();
      clear(root);
    },
  };
}
