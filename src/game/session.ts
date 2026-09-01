import { type Oklab, oklabToHex } from '../color/oklab';
import type { Puzzle } from '../puzzle/generator';
import { arrangementOf } from '../puzzle/generator';
import type { Cell } from '../puzzle/lattice';
import { type Arrangement, findHintSwap, isCellCorrect, isSolved, swap } from '../puzzle/solve';
import { BoardRenderer, type BoardView } from '../render/board';
import {
  type RevealPlan,
  buildRevealPlan,
  revealStateAt,
  totalRevealDuration,
} from '../render/reveal';
import type { Artwork, Subject } from '../content/types';

/** Distance in CSS pixels before a press counts as a drag rather than a tap. */
const DRAG_THRESHOLD = 8;
const SWAP_DURATION = 190;
const PULSE_DURATION = 700;

export interface SessionCallbacks {
  onFact(factIndex: number, text: string): void;
  onProgress(correct: number, total: number, moves: number): void;
  onSolved(moves: number): void;
  onRevealDone(): void;
}

interface PendingSwap {
  a: number;
  b: number;
  colorA: string;
  colorB: string;
  start: number;
}

/**
 * One playthrough of one puzzle: owns the board state, the input handling and
 * the animation loop, and reports upward through callbacks. Deliberately knows
 * nothing about screens or DOM layout beyond its own canvas.
 */
export class PuzzleSession {
  private renderer: BoardRenderer;
  private arrangement: Arrangement;
  private colors: string[];
  private lightness: number[];
  private selection: number | null = null;
  private cursor: number | null = null;
  private moves = 0;
  private undoStack: [number, number][] = [];
  private firedFacts = new Set<number>();

  private pointer: { cellId: number; x: number; y: number; dragging: boolean } | null = null;
  private activeSwap: PendingSwap | null = null;
  private pulses = new Map<number, number>();

  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private previewing = false;

  private revealPlan: RevealPlan | null = null;
  private revealStart: number | null = null;
  private revealDone = false;
  private solved = false;

  private frame = 0;
  private dirty = true;
  private destroyed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private puzzle: Puzzle,
    private artwork: Artwork,
    private subject: Subject,
    private options: { reducedMotion: boolean; lightnessAssist: boolean },
    private callbacks: SessionCallbacks,
  ) {
    this.renderer = new BoardRenderer(canvas);
    this.arrangement = arrangementOf(puzzle);
    this.colors = puzzle.order.map((tile) => oklabToHex(puzzle.tileColors[tile] as Oklab));
    this.lightness = puzzle.order.map((tile) => (puzzle.tileColors[tile] as Oklab).L);

    this.renderer.setLattice(puzzle.lattice);
    this.attach();
    this.reportProgress();
    this.loop();
    // Re-fit once layout has certainly settled; the first measurement can land
    // before the canvas has been given its box.
    requestAnimationFrame(() => {
      if (!this.destroyed) this.resize();
    });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.previewTimer !== null) clearTimeout(this.previewTimer);
    cancelAnimationFrame(this.frame);
    this.detach();
  }

  /**
   * Show the finished board for a moment, then let it fall back to the shuffle.
   *
   * This is lifted from I Love Hue, which does it on every level, and it is a
   * large part of why its hardest boards are fair rather than merely hard: it
   * turns "work out what this is supposed to look like" into "put back what you
   * just saw". Two-colour boards need it, because a plane has a target a player
   * cannot infer from a corner or two. One-colour boards do not -- "darkest to
   * lightest" says everything.
   *
   * Deliberately display-only. It swaps the colours being drawn and leaves the
   * arrangement alone, so nothing downstream can mistake the preview for a
   * solved board and fire the reveal.
   */
  preview(ms: number): void {
    if (this.previewing || ms <= 0) return;
    const shuffled = { colors: this.colors, lightness: this.lightness };

    this.colors = this.puzzle.lattice.cells.map((c) =>
      oklabToHex(this.puzzle.targets[c.id] as Oklab),
    );
    this.lightness = this.puzzle.lattice.cells.map(
      (c) => (this.puzzle.targets[c.id] as Oklab).L,
    );
    this.previewing = true;
    this.selection = null;
    this.dirty = true;

    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      if (this.destroyed) return;
      this.colors = shuffled.colors;
      this.lightness = shuffled.lightness;
      this.previewing = false;
      this.dirty = true;
    }, ms);
  }

  setLightnessAssist(on: boolean): void {
    this.options.lightnessAssist = on;
    this.dirty = true;
  }

  resize(): void {
    this.renderer.resize();
    this.dirty = true;
  }

  // ---------------------------------------------------------------- input

  private onPointerDown = (event: PointerEvent) => {
    if (this.solved || this.previewing) return;
    const cellId = this.renderer.pickAtClient(event.clientX, event.clientY);
    if (cellId === null) {
      this.selection = null;
      this.dirty = true;
      return;
    }
    if (this.puzzle.locked[cellId]) {
      // Nothing to do, but don't silently swallow it -- keep the selection so
      // the player doesn't lose their place by brushing a locked starter.
      return;
    }
    this.canvas.setPointerCapture(event.pointerId);
    this.pointer = { cellId, x: event.clientX, y: event.clientY, dragging: false };
    this.cursor = cellId;
    this.dirty = true;
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.pointer || this.pointer.dragging) return;
    if (Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y) > DRAG_THRESHOLD) {
      this.pointer.dragging = true;
      this.selection = this.pointer.cellId;
      this.dirty = true;
    }
  };

  private onPointerUp = (event: PointerEvent) => {
    const pointer = this.pointer;
    this.pointer = null;
    if (!pointer) return;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }

    const target = this.renderer.pickAtClient(event.clientX, event.clientY);

    if (pointer.dragging) {
      if (target !== null && target !== pointer.cellId && !this.puzzle.locked[target]) {
        this.applySwap(pointer.cellId, target);
      }
      this.selection = null;
    } else if (this.selection === null) {
      this.selection = pointer.cellId;
    } else if (this.selection === pointer.cellId) {
      this.selection = null;
    } else {
      this.applySwap(this.selection, pointer.cellId);
      this.selection = null;
    }
    this.dirty = true;
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (this.solved || this.previewing) return;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };

    const direction = directions[event.key];
    if (direction) {
      event.preventDefault();
      this.moveCursor(direction);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.activateCursor();
    } else if (event.key === 'Escape') {
      this.selection = null;
      this.dirty = true;
    }
  };

  /**
   * Move the keyboard cursor to the neighbor best matching a direction.
   * Works off cell centers rather than grid indices, so it behaves the same on
   * hexagons and triangles as on squares.
   */
  private moveCursor(direction: [number, number]): void {
    const cells = this.puzzle.lattice.cells;
    const from = this.cursor === null ? null : cells[this.cursor];
    if (!from) {
      this.cursor = cells[0]?.id ?? null;
      this.dirty = true;
      return;
    }

    let best: number | null = null;
    let bestScore = -Infinity;
    const candidates = from.neighbors.length > 0 ? from.neighbors : cells.map((c) => c.id);
    for (const id of candidates) {
      const cell = cells[id] as Cell;
      const dx = cell.cx - from.cx;
      const dy = cell.cy - from.cy;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      // Favour the neighbour most aligned with the requested direction.
      const alignment = (dx * direction[0] + dy * direction[1]) / length;
      if (alignment > 0.35 && alignment > bestScore) {
        bestScore = alignment;
        best = id;
      }
    }
    if (best !== null) {
      this.cursor = best;
      this.dirty = true;
    }
  }

  private activateCursor(): void {
    if (this.cursor === null) {
      this.cursor = this.puzzle.lattice.cells[0]?.id ?? null;
      this.dirty = true;
      return;
    }
    if (this.puzzle.locked[this.cursor]) return;

    if (this.selection === null) this.selection = this.cursor;
    else if (this.selection === this.cursor) this.selection = null;
    else {
      this.applySwap(this.selection, this.cursor);
      this.selection = null;
    }
    this.dirty = true;
  }

  // ------------------------------------------------------------- mutation

  private applySwap(a: number, b: number, countMove = true): void {
    if (a === b || this.puzzle.locked[a] || this.puzzle.locked[b]) return;

    const colorA = this.colors[a] as string;
    const colorB = this.colors[b] as string;

    swap(this.puzzle.order, a, b);
    this.colors[a] = colorB;
    this.colors[b] = colorA;
    const lightA = this.lightness[a] as number;
    this.lightness[a] = this.lightness[b] as number;
    this.lightness[b] = lightA;

    if (countMove) {
      this.moves++;
      this.undoStack.push([a, b]);
    }

    this.activeSwap = { a, b, colorA, colorB, start: performance.now() };
    this.dirty = true;

    this.checkFacts();
    this.reportProgress();
    this.checkSolved();
  }

  undo(): void {
    if (this.solved) return;
    const last = this.undoStack.pop();
    if (!last) return;
    this.applySwap(last[0], last[1], false);
    // Undo takes the move back off the counter rather than adding a second one;
    // exploring shouldn't be punished in a puzzle that rewards experimenting.
    this.moves = Math.max(0, this.moves - 1);
    this.reportProgress();
  }

  hint(): boolean {
    if (this.solved) return false;
    const hint = findHintSwap(this.arrangement, this.puzzle.locked);
    if (!hint) return false;
    this.applySwap(hint.from, hint.to);
    return true;
  }

  /** Fires any fact tile that has just landed correctly. */
  private checkFacts(): void {
    this.puzzle.factCells.forEach((cellId, factIndex) => {
      if (this.firedFacts.has(cellId)) return;
      if (!isCellCorrect(this.arrangement, cellId)) return;

      this.firedFacts.add(cellId);
      this.pulses.set(cellId, performance.now());
      const text = this.subject.facts[factIndex];
      if (text) this.callbacks.onFact(factIndex, text);
    });
  }

  private reportProgress(): void {
    let correct = 0;
    for (let i = 0; i < this.puzzle.order.length; i++) {
      if (isCellCorrect(this.arrangement, i)) correct++;
    }
    this.callbacks.onProgress(correct, this.puzzle.order.length, this.moves);
  }

  private checkSolved(): void {
    if (this.solved || !isSolved(this.arrangement)) return;
    this.solved = true;
    this.selection = null;
    this.revealPlan = buildRevealPlan(this.puzzle.lattice, this.artwork.pixels);
    this.revealStart = performance.now();
    this.callbacks.onSolved(this.moves);
  }

  /** Skip straight to the end of the reveal animation. */
  skipReveal(): void {
    if (!this.solved || this.revealDone) return;
    this.revealStart = performance.now() - totalRevealDuration(this.options.reducedMotion);
    this.dirty = true;
  }

  isSolved(): boolean {
    return this.solved;
  }

  // ------------------------------------------------------------- rendering

  private loop = () => {
    if (this.destroyed) return;
    const now = performance.now();

    if (this.activeSwap && now - this.activeSwap.start >= SWAP_DURATION) {
      this.activeSwap = null;
      this.dirty = true;
    }
    for (const [cellId, start] of this.pulses) {
      if (now - start >= PULSE_DURATION) this.pulses.delete(cellId);
    }

    const animating =
      this.activeSwap !== null || this.pulses.size > 0 || (this.solved && !this.revealDone);

    if (this.dirty || animating) {
      this.renderer.draw(this.buildView(now));
      this.dirty = false;
    }

    this.frame = requestAnimationFrame(this.loop);
  };

  private buildView(now: number): BoardView {
    const swapView = this.activeSwap
      ? {
          a: this.activeSwap.a,
          b: this.activeSwap.b,
          colorA: this.activeSwap.colorA,
          colorB: this.activeSwap.colorB,
          t: Math.min(1, (now - this.activeSwap.start) / SWAP_DURATION),
        }
      : null;

    const pulses = new Map<number, number>();
    for (const [cellId, start] of this.pulses) {
      pulses.set(cellId, Math.min(1, (now - start) / PULSE_DURATION));
    }

    let reveal: BoardView['reveal'] = null;
    if (this.solved && this.revealPlan && this.revealStart !== null) {
      const state = revealStateAt(now - this.revealStart, this.options.reducedMotion);
      reveal = { state, plan: this.revealPlan, artwork: this.artwork.canvas };
      if (state.phase === 'done' && !this.revealDone) {
        this.revealDone = true;
        this.callbacks.onRevealDone();
      }
    }

    return {
      colors: this.colors,
      lightness: this.lightness,
      locked: this.puzzle.locked,
      selection: this.selection ?? this.cursor,
      swap: swapView,
      pulses,
      reveal,
      lightnessAssist: this.options.lightnessAssist,
    };
  }

  // --------------------------------------------------------------- wiring

  private attach(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('keydown', this.onKeyDown);
  }

  private detach(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('keydown', this.onKeyDown);
  }
}
