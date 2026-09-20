import { type Oklab, oklabToHex } from '../color/oklab';
import { fitToGamut } from '../color/gamut';
import type { Puzzle } from '../puzzle/generator';
import { arrangementOf } from '../puzzle/generator';
import type { Cell, Point } from '../puzzle/lattice';
import { type Arrangement, findHintSwap, isCellCorrect, isSolved, swap } from '../puzzle/solve';
import { BoardRenderer, type BoardView, type Flight, type Spark } from '../render/board';
import {
  type RevealPlan,
  buildRevealPlan,
  revealStateAt,
  totalRevealDuration,
} from '../render/reveal';
import type { Artwork, Subject } from '../content/types';

/** How long a tile takes to fly into a cell, after a swap or on being let go. */
const FLIGHT_MS = 190;
const PULSE_DURATION = 700;
/** How long the sparks from a landing take to die. */
const SPARK_MS = 720;
const SPARKS_PER_LANDING = 16;
/**
 * On touch the carried tile rides this many cells above the finger, so the
 * finger does not hide the thing being placed. A mouse pointer hides nothing.
 */
const TOUCH_LIFT = 0.55;

/**
 * Cooling: the board opens hot and settles to its true colours as it is played.
 *
 * The lift is the same on every tile, and that is what makes it honest. The
 * sort is by lightness, and a constant offset cannot change an ordering, so a
 * hot board is exactly as sortable as a cold one; the player is never asked to
 * see through the heat, only to watch it go. Chroma is fitted to gamut after
 * the lift, and fitting holds lightness fixed, so even the clipping cannot
 * reorder anything.
 *
 * Nothing waits on it. It is atmosphere -- the flow setting while you read it
 * -- and when it has cooled the board is simply the board.
 */
export const COOLING_TUNING = {
  /** How long the board takes to reach its true colours. */
  durationMs: 180_000,
  /** Lightness added to every tile at full heat. */
  lift: 0.05,
  /** Oklab a (toward red) and b (toward yellow) added at full heat: the colour of ember. */
  warmA: 0.025,
  warmB: 0.05,
} as const;

/** How long a drilled core stays readable beside its column. */
const CORE_MS = 1800;
/** Cells whose centre lies within this many tile-widths of the tapped one are the column. */
const CORE_COLUMN_REACH = 0.51;

export interface SessionCallbacks {
  onFact(factIndex: number, text: string): void;
  onProgress(correct: number, total: number, moves: number): void;
  /** Tiles that have just landed correctly for the first time this play. */
  onPlaced(count: number): void;
  /** The keyboard asked for a core; the screen decides whether one can be spent. */
  onCoreKey(): void;
  /** A core was drilled. */
  onCore(): void;
  onSolved(moves: number): void;
  onRevealDone(): void;
}

/** A tile colour under the heat of a board that has not cooled yet. */
export function heated(color: Oklab, heat: number): Oklab {
  if (heat <= 0) return color;
  const { lift, warmA, warmB } = COOLING_TUNING;
  return fitToGamut({
    L: color.L + lift * heat,
    a: color.a + warmA * heat,
    b: color.b + warmB * heat,
  });
}

/** Heat left in a board `elapsed` ms after it opened: full at first, falling fast, then slowly to nothing. */
export function heatAfter(elapsed: number): number {
  const t = Math.min(1, Math.max(0, elapsed / COOLING_TUNING.durationMs));
  return Math.pow(1 - t, 2);
}

/** A tile in the player's hand. */
interface Carry {
  pointerId: number;
  /** The cell it came from, drawn empty while it is out. */
  cell: number;
  /** Where the tile is, in board units. */
  at: Point;
  touch: boolean;
}

interface FlightInProgress {
  cell: number;
  color: string;
  from: Point;
  start: number;
}

interface SparkInFlight {
  x: number;
  y: number;
  dx: number;
  dy: number;
  born: number;
  gold: boolean;
}

/**
 * One playthrough of one puzzle: owns the board state, the input handling and
 * the animation loop, and reports upward through callbacks. Deliberately knows
 * nothing about screens or DOM layout beyond its own canvas.
 *
 * Pointer play is drag and drop: press a tile and it lifts, carry it, drop it
 * on another and they swap; let it go anywhere else and it flies home. Nothing
 * is ever "selected", so nothing needs a ring around it. The keyboard cannot
 * drag, so it keeps a cursor and a pick-up-and-put-down, with the cursor ringed
 * only while the keyboard is the thing driving.
 */
export class PuzzleSession {
  private renderer: BoardRenderer;
  private arrangement: Arrangement;
  /** The colour actually in each cell, by cell id, before any heat. */
  private trueColors: Oklab[];
  /** What is drawn in each cell: the true colour under whatever heat is left. */
  private colors: string[];
  private lightness: number[];
  private moves = 0;
  private undoStack: [number, number][] = [];
  private firedFacts = new Set<number>();
  /** Cells that have been correct at some point this play, so a placement counts once. */
  private everCorrect = new Set<number>();

  /** Heat left in the board, 1 at opening and 0 once cooled; always 0 without the twist. */
  private heat = 0;
  private openedAt = performance.now();

  /** A core is armed: the next tap on the board drills it. */
  private coring = false;
  private core: { cells: number[]; start: number } | null = null;

  private carry: Carry | null = null;
  private target: number | null = null;
  private flights: FlightInProgress[] = [];
  private sparks: SparkInFlight[] = [];
  private pulses = new Map<number, number>();

  /** Keyboard state: where the cursor is, what it has picked up, and whether it is in charge. */
  private cursor: number | null = null;
  private held: number | null = null;
  private keyboard = false;

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
    private options: {
      reducedMotion: boolean;
      lightnessAssist: boolean;
      lit: boolean;
      /** The board opens hot and cools. Off under reduced motion, like the rest of the light. */
      cooling?: boolean;
    },
    private callbacks: SessionCallbacks,
  ) {
    this.renderer = new BoardRenderer(canvas);
    this.arrangement = arrangementOf(puzzle);
    this.trueColors = puzzle.order.map((tile) => puzzle.tileColors[tile] as Oklab);
    this.lightness = puzzle.order.map((tile) => (puzzle.tileColors[tile] as Oklab).L);
    this.heat = options.cooling && !options.reducedMotion ? 1 : 0;
    this.colors = this.drawnColors(this.trueColors);

    // Whatever the shuffle left correct, starters included, was not placed by
    // anyone and earns nothing.
    for (let i = 0; i < puzzle.order.length; i++) {
      if (isCellCorrect(this.arrangement, i)) this.everCorrect.add(i);
    }

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
    const shuffled = { trueColors: this.trueColors, lightness: this.lightness };

    this.trueColors = this.puzzle.lattice.cells.map((c) => this.puzzle.targets[c.id] as Oklab);
    this.lightness = this.puzzle.lattice.cells.map(
      (c) => (this.puzzle.targets[c.id] as Oklab).L,
    );
    this.colors = this.drawnColors(this.trueColors);
    this.previewing = true;
    this.dropEverything();
    this.dirty = true;

    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      if (this.destroyed) return;
      this.trueColors = shuffled.trueColors;
      this.lightness = shuffled.lightness;
      this.colors = this.drawnColors(this.trueColors);
      this.previewing = false;
      this.dirty = true;
    }, ms);
  }

  /** The CSS colour each of `colors` is drawn as under the board's current heat. */
  private drawnColors(colors: readonly Oklab[]): string[] {
    return colors.map((c) => oklabToHex(heated(c, this.heat)));
  }

  /**
   * Let the board cool by however long has passed. Redraws only when the heat
   * has moved enough to show, so a cooling board is not a three-minute
   * animation at sixty frames a second.
   */
  private cool(now: number): void {
    if (this.heat <= 0) return;
    const next = Math.ceil(heatAfter(now - this.openedAt) * 200) / 200;
    if (next === this.heat) return;
    this.heat = next;
    this.colors = this.drawnColors(this.trueColors);
    this.dirty = true;
  }

  // ---------------------------------------------------------------- cores

  /**
   * Arm a core: the next tap on the board drills its column. The screen owns
   * the bank and calls this only when there is a core to spend; the session
   * only knows how to drill.
   */
  armCore(): boolean {
    if (this.solved || this.previewing || this.coring) return false;
    this.dropEverything();
    this.coring = true;
    this.canvas.classList.add('board-coring');
    this.dirty = true;
    return true;
  }

  disarmCore(): void {
    if (!this.coring) return;
    this.coring = false;
    this.canvas.classList.remove('board-coring');
    this.dirty = true;
  }

  isCoring(): boolean {
    return this.coring;
  }

  /**
   * Drill the column through `cellId`: every cell whose centre lies within
   * half a tile of its vertical line, top to bottom. Half a tile rather than a
   * grid index, so a hex or triangle board -- where alternate rows sit half a
   * cell over -- gives a core that zigzags down one column rather than nothing.
   */
  private drill(cellId: number): void {
    const cells = this.puzzle.lattice.cells;
    const at = cells[cellId] as Cell;
    const reach = this.renderer.cellSize() * CORE_COLUMN_REACH;
    const column = cells
      .filter((c) => Math.abs(c.cx - at.cx) <= reach)
      .sort((a, b) => a.cy - b.cy)
      .map((c) => c.id);
    this.core = { cells: column, start: performance.now() };
    this.disarmCore();
    this.callbacks.onCore();
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
    if (this.solved || this.previewing || this.carry) return;
    const cell = this.renderer.pickAtClient(event.clientX, event.clientY);
    // An armed core drills whatever column is tapped, starters included; a tap
    // on the ground puts the drill away and costs nothing.
    if (this.coring) {
      if (cell === null) this.disarmCore();
      else this.drill(cell);
      return;
    }
    // A locked starter, or the ground between tiles, is simply not a handle.
    if (cell === null || this.puzzle.locked[cell]) return;

    this.canvas.setPointerCapture(event.pointerId);
    // The pointer takes over from the keyboard: whatever it was holding is
    // put down and its cursor ring goes away.
    this.keyboard = false;
    this.held = null;
    const touch = event.pointerType === 'touch';
    this.carry = { pointerId: event.pointerId, cell, at: this.liftPoint(event, touch), touch };
    this.target = null;
    this.canvas.classList.add('board-dragging');
    this.dirty = true;
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.carry || event.pointerId !== this.carry.pointerId) return;
    this.carry.at = this.liftPoint(event, this.carry.touch);
    this.target = this.dropTargetAt(this.carry.at, this.carry.cell);
    this.dirty = true;
  };

  private onPointerUp = (event: PointerEvent) => {
    const carry = this.carry;
    if (!carry || event.pointerId !== carry.pointerId) return;
    this.carry = null;
    this.target = null;
    this.canvas.classList.remove('board-dragging');
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }

    // A cancelled pointer carries no useful position: the tile goes home from
    // wherever it last was.
    const at = event.type === 'pointercancel' ? carry.at : this.liftPoint(event, carry.touch);
    const target = this.dropTargetAt(at, carry.cell);
    if (target !== null) this.applySwap(carry.cell, target, true, at);
    else this.launch(carry.cell, this.colors[carry.cell] as string, at);
    this.dirty = true;
  };

  /** Where the carried tile sits for this pointer, in board units. */
  private liftPoint(event: PointerEvent, touch: boolean): Point {
    const [x, y] = this.renderer.clientToBoard(event.clientX, event.clientY);
    return [x, touch ? y - this.renderer.cellSize() * TOUCH_LIFT : y];
  }

  /**
   * The cell a tile carried to `at` would drop into. Judged from the tile, not
   * the finger, so what you see hovering is what lands.
   */
  private dropTargetAt(at: Point, home: number): number | null {
    const cell = this.renderer.pickAtBoard(at[0], at[1]);
    if (cell === null || cell === home || this.puzzle.locked[cell]) return null;
    return cell;
  }

  /** Put down anything in hand, pointer or keyboard, without a swap. */
  private dropEverything(): void {
    if (this.carry) {
      if (this.canvas.hasPointerCapture(this.carry.pointerId)) {
        this.canvas.releasePointerCapture(this.carry.pointerId);
      }
      this.canvas.classList.remove('board-dragging');
    }
    this.carry = null;
    this.target = null;
    this.held = null;
  }

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
      this.keyboard = true;
      this.moveCursor(direction);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.keyboard = true;
      if (this.coring) {
        if (this.cursor !== null) this.drill(this.cursor);
        return;
      }
      this.activateCursor();
    } else if (event.key === 'Escape') {
      this.held = null;
      this.disarmCore();
      this.dirty = true;
    } else if (event.key === 'c' || event.key === 'C') {
      event.preventDefault();
      this.keyboard = true;
      if (this.coring) this.disarmCore();
      else this.callbacks.onCoreKey();
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

    if (this.held === null) this.held = this.cursor;
    else if (this.held === this.cursor) this.held = null;
    else {
      this.applySwap(this.held, this.cursor);
      this.held = null;
    }
    this.dirty = true;
  }

  // ------------------------------------------------------------- mutation

  /**
   * Swap two cells. The tile leaving `a` flies into `b` from `carriedFrom` if
   * it was in the player's hand, otherwise from its own cell; the tile it
   * displaces flies back into `a`.
   */
  private applySwap(a: number, b: number, countMove = true, carriedFrom?: Point): void {
    if (a === b || this.puzzle.locked[a] || this.puzzle.locked[b]) return;

    const colorA = this.colors[a] as string;
    const colorB = this.colors[b] as string;
    const wasRightA = isCellCorrect(this.arrangement, a);
    const wasRightB = isCellCorrect(this.arrangement, b);

    swap(this.puzzle.order, a, b);
    this.colors[a] = colorB;
    this.colors[b] = colorA;
    const trueA = this.trueColors[a] as Oklab;
    this.trueColors[a] = this.trueColors[b] as Oklab;
    this.trueColors[b] = trueA;
    const lightA = this.lightness[a] as number;
    this.lightness[a] = this.lightness[b] as number;
    this.lightness[b] = lightA;

    if (countMove) {
      this.moves++;
      this.undoStack.push([a, b]);
    }

    this.launch(b, colorA, carriedFrom ?? this.centre(a));
    this.launch(a, colorB, this.centre(b));
    // A tile landing where it belongs throws off a few sparks -- only a landing
    // that is newly right, so they mean something. Decoration on top of the
    // same correctness test the progress count uses; nothing here changes it.
    if (!wasRightA && isCellCorrect(this.arrangement, a)) this.sparkle(a);
    if (!wasRightB && isCellCorrect(this.arrangement, b)) this.sparkle(b);
    this.dirty = true;

    // A placement is a tile landing right for the first time this play. Undo
    // and redo, or lifting a right tile and putting it back, earn nothing.
    let placed = 0;
    for (const cell of [a, b]) {
      if (this.everCorrect.has(cell) || !isCellCorrect(this.arrangement, cell)) continue;
      this.everCorrect.add(cell);
      placed++;
    }
    if (placed > 0) this.callbacks.onPlaced(placed);

    this.checkFacts();
    this.reportProgress();
    this.checkSolved();
  }

  private centre(cellId: number): Point {
    const cell = this.puzzle.lattice.cells[cellId] as Cell;
    return [cell.cx, cell.cy];
  }

  /** Send a tile flying into `cell` from `from`. Under reduced motion it is simply there. */
  private launch(cell: number, color: string, from: Point): void {
    if (this.options.reducedMotion) return;
    this.flights.push({ cell, color, from, start: performance.now() });
  }

  /** Scatter sparks from a cell, in gold and moon-blue, out to about a tile's width. */
  private sparkle(cell: number): void {
    if (!this.options.lit) return;
    const [x, y] = this.centre(cell);
    const reach = this.renderer.cellSize();
    const born = performance.now();
    for (let i = 0; i < SPARKS_PER_LANDING; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = reach * (0.35 + Math.random() * 0.6);
      this.sparks.push({
        x,
        y,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance - reach * 0.15,
        born,
        gold: Math.random() < 0.7,
      });
    }
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
    this.dropEverything();
    this.revealPlan = buildRevealPlan(
      this.puzzle.lattice,
      this.artwork.pixels,
      this.renderer.revealFrame(),
    );
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

    const landed = this.flights.length;
    this.flights = this.flights.filter((flight) => now - flight.start < FLIGHT_MS);
    if (this.flights.length !== landed) this.dirty = true;
    const sparking = this.sparks.length;
    this.sparks = this.sparks.filter((spark) => now - spark.born < SPARK_MS);
    if (this.sparks.length !== sparking) this.dirty = true;
    for (const [cellId, start] of this.pulses) {
      if (now - start >= PULSE_DURATION) this.pulses.delete(cellId);
    }
    if (this.core && now - this.core.start >= CORE_MS) {
      this.core = null;
      this.dirty = true;
    }
    if (!this.solved) this.cool(now);

    // Under the light the finished picture keeps breathing, so the reveal stays
    // live after it is done; one gradient and one drawImage a frame.
    const animating =
      this.flights.length > 0 ||
      this.sparks.length > 0 ||
      this.pulses.size > 0 ||
      this.core !== null ||
      (this.solved && (!this.revealDone || this.options.lit));

    if (this.dirty || animating) {
      this.renderer.draw(this.buildView(now));
      this.dirty = false;
    }

    this.frame = requestAnimationFrame(this.loop);
  };

  private buildView(now: number): BoardView {
    const flights: Flight[] = this.flights.map((flight) => ({
      cell: flight.cell,
      color: flight.color,
      from: flight.from,
      t: Math.min(1, (now - flight.start) / FLIGHT_MS),
    }));

    const pulses = new Map<number, number>();
    for (const [cellId, start] of this.pulses) {
      pulses.set(cellId, Math.min(1, (now - start) / PULSE_DURATION));
    }
    const sparks: Spark[] = this.sparks.map((spark) => ({
      x: spark.x,
      y: spark.y,
      dx: spark.dx,
      dy: spark.dy,
      t: Math.min(1, (now - spark.born) / SPARK_MS),
      gold: spark.gold,
    }));

    // The crust: tiles that have set. Only a cooling board shows it, and it is
    // texture, never a colour change, so the heat stays the same on every tile.
    const crust = this.options.cooling
      ? this.puzzle.order.map((_, cellId) => isCellCorrect(this.arrangement, cellId))
      : null;

    // The core is drawn under the same heat as the tiles it sits beside, so
    // the comparison it invites is a fair one.
    const core = this.core
      ? {
          cells: this.core.cells,
          colors: this.core.cells.map((id) =>
            oklabToHex(heated(this.puzzle.targets[id] as Oklab, this.heat)),
          ),
          t: Math.min(1, (now - this.core.start) / CORE_MS),
        }
      : null;

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
      lit: this.options.lit,
      time: now,
      sparks,
      colors: this.colors,
      lightness: this.lightness,
      locked: this.puzzle.locked,
      cursor: this.keyboard ? this.cursor : null,
      held: this.held,
      // The colour is read live rather than remembered at pick-up, so a hint
      // or undo landing mid-carry cannot leave a stale tile in the hand.
      carry: this.carry
        ? { cell: this.carry.cell, color: this.colors[this.carry.cell] as string, at: this.carry.at }
        : null,
      target: this.target,
      flights,
      pulses,
      reveal,
      lightnessAssist: this.options.lightnessAssist,
      crust,
      core,
      coring: this.coring,
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
