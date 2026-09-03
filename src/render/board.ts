import type { Cell, Lattice, Point } from '../puzzle/lattice';
import { PickingBuffer } from './picking';
import {
  type BoardTransform,
  fitTransform,
  insetPolygon,
  project,
  tracePolygon,
  unproject,
} from './transform';
import type { RevealPlan, RevealState } from './reveal';

/** A tile in the air, on its way into a cell. */
export interface Flight {
  /** The cell it lands in. */
  cell: number;
  color: string;
  /** Where it set off from, in board units. */
  from: Point;
  /** Progress, 0..1. */
  t: number;
}

/** Everything the renderer needs to draw one frame. */
export interface BoardView {
  /** CSS color currently sitting in each cell, by cell id. */
  colors: string[];
  /** Perceptual lightness 0..1 per cell, for the accessibility overlay. */
  lightness: number[];
  locked: boolean[];
  /**
   * The keyboard cursor. Ringed only while the keyboard is driving, which is
   * the one time a player needs telling where they are: a pointer always knows.
   */
  cursor: number | null;
  /** A tile the keyboard has picked up, lifted in place until it is put down. */
  held: number | null;
  /** A tile under the pointer: drawn at `at`, its own cell left empty. */
  carry: { cell: number; color: string; at: Point } | null;
  /** The cell a carried tile would drop into, pressed a little to say so. */
  target: number | null;
  /** Tiles in the air after a swap, or on their way home after being let go. */
  flights: Flight[];
  /** Cells that just fired a fact, for a brief pulse. */
  pulses: Map<number, number>;
  reveal: { state: RevealState; plan: RevealPlan; artwork: HTMLCanvasElement } | null;
  lightnessAssist: boolean;
}

// Keep the playing field perceptually neutral even though the surrounding UI
// is richly textured. These are presentation tokens only: tile colors and all
// correctness calculations remain untouched.
const BACKGROUND = '#0a090c';
const EMPTY_CELL = '#17141b';

/** How much a carried tile grows, so it reads as above the board. */
const CARRY_LIFT = 1.12;
/** A keyboard-held tile lifts less: it is not going anywhere yet. */
const HELD_LIFT = 1.08;
/** The drop target sinks a little under the tile hovering over it. */
const TARGET_PRESS = 0.9;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Canvas 2D board renderer.
 *
 * Canvas rather than SVG because a hard board runs to several hundred tiles and
 * every one of them animates during the reveal; DOM nodes at that count stutter
 * on the low-end Android hardware this is meant to be played on.
 */
export class BoardRenderer {
  private ctx: CanvasRenderingContext2D;
  private picking = new PickingBuffer();
  private transform: BoardTransform = { scale: 1, offsetX: 0, offsetY: 0 };
  private lattice: Lattice | null = null;
  private gutter = 0;
  private typicalCell = 1;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
  }

  setLattice(lattice: Lattice): void {
    this.lattice = lattice;
    this.resize();
  }

  /** Re-fit to the canvas's CSS size. Safe to call on every resize event. */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width);
    const cssHeight = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    this.canvas.width = Math.floor(cssWidth * this.dpr);
    this.canvas.height = Math.floor(cssHeight * this.dpr);

    if (!this.lattice) return;

    const padding = Math.max(8, Math.min(cssWidth, cssHeight) * 0.035) * this.dpr;
    this.transform = fitTransform(
      this.lattice,
      this.canvas.width,
      this.canvas.height,
      padding,
    );

    // Gutter scaled to tile size: a fixed pixel gap swallows small tiles whole
    // on a hard board and disappears entirely on an easy one.
    this.typicalCell = Math.sqrt(
      (this.lattice.width * this.lattice.height) / this.lattice.cells.length,
    );
    this.gutter = Math.min(this.typicalCell * 0.06, this.typicalCell * 0.5);

    this.picking.rebuild(this.lattice, this.transform, this.canvas.width, this.canvas.height);
  }

  /** Cell id under a client-space point, or null. */
  pickAtClient(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    return this.picking.pick(
      (clientX - rect.left) * this.dpr,
      (clientY - rect.top) * this.dpr,
    );
  }

  /** Cell id under a point in board units, or null. */
  pickAtBoard(x: number, y: number): number | null {
    const [px, py] = project(this.transform, x, y);
    return this.picking.pick(px, py);
  }

  /** A client-space point in board units, so a carried tile can be drawn there. */
  clientToBoard(clientX: number, clientY: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    return unproject(
      this.transform,
      (clientX - rect.left) * this.dpr,
      (clientY - rect.top) * this.dpr,
    );
  }

  /** The side of a typical tile, in board units. */
  cellSize(): number {
    return this.typicalCell;
  }

  draw(view: BoardView): void {
    const { ctx, lattice } = this;
    if (!lattice) return;

    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (view.reveal && view.reveal.state.phase !== 'settle') {
      this.drawReveal(view, view.reveal);
      return;
    }

    // A cell whose tile is in the air, or in the player's hand, is drawn empty.
    const empty = new Set<number>();
    for (const flight of view.flights) empty.add(flight.cell);
    if (view.carry) empty.add(view.carry.cell);

    for (const cell of lattice.cells) {
      if (empty.has(cell.id)) {
        this.fillCell(cell, EMPTY_CELL, 1);
        continue;
      }
      const pulse = view.pulses.get(cell.id);
      const press = cell.id === view.target ? TARGET_PRESS : 1;
      this.fillCell(cell, view.colors[cell.id] ?? '#000', 1, pulse, press);
      if (view.locked[cell.id]) this.drawLockMark(cell);
      if (view.lightnessAssist) this.drawLightnessMark(cell, view.lightness[cell.id] ?? 0);
    }

    for (const flight of view.flights) this.drawFlight(flight);

    if (view.held !== null) {
      const cell = lattice.cells[view.held];
      if (cell) this.drawLifted(cell, view.colors[view.held] ?? '#000', [cell.cx, cell.cy], HELD_LIFT, 0.6);
    }
    // Last, so it rides over everything.
    if (view.carry) {
      const cell = lattice.cells[view.carry.cell];
      if (cell) this.drawLifted(cell, view.carry.color, view.carry.at, CARRY_LIFT, 1);
    }

    if (view.cursor !== null) this.drawCursor(view.cursor);
  }

  private fillCell(cell: Cell, color: string, alpha: number, pulse?: number, press = 1): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;

    let poly: readonly Point[] = insetPolygon(cell.poly, this.gutter);
    let scale = press;
    if (pulse !== undefined && pulse > 0) {
      // Brief swell outward when a fact tile lands, drawing the eye to it.
      scale *= 1 + Math.sin(pulse * Math.PI) * 0.18;
    }
    if (scale !== 1) poly = scaleAbout(poly, cell.cx, cell.cy, scale);

    ctx.fillStyle = color;
    tracePolygon(ctx, poly, this.transform);
    ctx.fill();
    ctx.restore();
  }

  /** Locked starters get a ring so their immovability is visible, not learned by trying. */
  private drawLockMark(cell: Cell): void {
    const { ctx } = this;
    const [px, py] = project(this.transform, cell.cx, cell.cy);
    const radius = Math.max(2.5, this.gutter * this.transform.scale * 1.1);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1.2, radius * 0.32);
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Lightness assist: a bar whose length tracks the tile's perceptual lightness.
   * The task is ordering by lightness, and lightness survives color-vision
   * deficiency, so this makes the game playable without relying on hue at all.
   */
  private drawLightnessMark(cell: Cell, lightness: number): void {
    const { ctx } = this;
    const [px, py] = project(this.transform, cell.cx, cell.cy);
    const cellPx = this.typicalCell * this.transform.scale;
    const barWidth = cellPx * 0.52;
    const barHeight = Math.max(1.5, cellPx * 0.08);

    ctx.save();
    ctx.fillStyle = lightness > 0.55 ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)';
    ctx.fillRect(px - barWidth / 2, py + cellPx * 0.22, barWidth * lightness, barHeight);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.75;
    ctx.strokeRect(px - barWidth / 2, py + cellPx * 0.22, barWidth, barHeight);
    ctx.restore();
  }

  /** The keyboard cursor: an outline, since the keyboard has no other way to point. */
  private drawCursor(cellId: number): void {
    const cell = this.lattice?.cells[cellId];
    if (!cell) return;
    const { ctx } = this;
    ctx.save();
    // Two-tone outline so it stays visible against both a near-white and a
    // near-black tile without knowing which it is.
    tracePolygon(ctx, insetPolygon(cell.poly, this.gutter * 0.4), this.transform);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 5 * (this.dpr / 2 + 0.5);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 * (this.dpr / 2 + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * A tile off the board: its own outline, moved to `at`, grown by `lift`, with
   * a shadow whose weight says how far above the board it is. This is the one
   * drawing for a carried tile, a keyboard-held one, and a tile in flight.
   */
  private drawLifted(cell: Cell, color: string, at: Point, lift: number, strength: number): void {
    const { ctx } = this;
    const dx = at[0] - cell.cx;
    const dy = at[1] - cell.cy;
    const poly = scaleAbout(
      insetPolygon(cell.poly, this.gutter).map(([x, y]) => [x + dx, y + dy] as Point),
      at[0],
      at[1],
      lift,
    );
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = `rgba(0,0,0,${0.5 * strength})`;
    ctx.shadowBlur = 14 * this.dpr * strength;
    ctx.shadowOffsetY = 5 * this.dpr * strength;
    tracePolygon(ctx, poly, this.transform);
    ctx.fill();
    ctx.restore();
  }

  /** A tile flying into its cell, rising a little at the midpoint so it reads as travelling over the board. */
  private drawFlight(flight: Flight): void {
    const cell = this.lattice?.cells[flight.cell];
    if (!cell) return;
    const t = easeInOut(flight.t);
    const at: Point = [
      flight.from[0] + (cell.cx - flight.from[0]) * t,
      flight.from[1] + (cell.cy - flight.from[1]) * t,
    ];
    const arc = Math.sin(t * Math.PI);
    this.drawLifted(cell, flight.color, at, 1 + arc * 0.1, arc);
  }

  private drawReveal(view: BoardView, reveal: NonNullable<BoardView['reveal']>): void {
    const { ctx, lattice } = this;
    if (!lattice) return;
    const { state, plan, artwork } = reveal;

    const morphT = state.phase === 'morph' ? easeInOut(state.t) : 1;

    if (state.phase !== 'crossfade' && state.phase !== 'done') {
      for (const cell of lattice.cells) {
        const dx = ((plan.targetCx[cell.id] as number) - cell.cx) * morphT;
        const dy = ((plan.targetCy[cell.id] as number) - cell.cy) * morphT;
        const scale = 1 + ((plan.targetScale[cell.id] as number) - 1) * morphT;
        const poly = scaleAbout(
          cell.poly.map(([x, y]) => [x + dx, y + dy] as Point),
          cell.cx + dx,
          cell.cy + dy,
          scale,
        );

        ctx.save();
        // Gutters close up as the tiles become pixels of a single picture.
        ctx.fillStyle = view.colors[cell.id] ?? '#000';
        tracePolygon(ctx, poly, this.transform);
        ctx.fill();
        ctx.globalAlpha = morphT;
        ctx.fillStyle = plan.targetColor[cell.id] as string;
        ctx.fill();
        ctx.restore();
      }
    }

    if (state.phase === 'crossfade' || state.phase === 'done') {
      // Draw the settled mosaic, then bring the real artwork up over it.
      for (const cell of lattice.cells) {
        const poly = scaleAbout(
          cell.poly.map(
            ([x, y]) =>
              [
                x + ((plan.targetCx[cell.id] as number) - cell.cx),
                y + ((plan.targetCy[cell.id] as number) - cell.cy),
              ] as Point,
          ),
          plan.targetCx[cell.id] as number,
          plan.targetCy[cell.id] as number,
          plan.targetScale[cell.id] as number,
        );
        ctx.fillStyle = plan.targetColor[cell.id] as string;
        tracePolygon(ctx, poly, this.transform);
        ctx.fill();
      }

      const alpha = state.phase === 'done' ? 1 : easeOut(state.t);
      const [x, y] = project(this.transform, plan.square.x, plan.square.y);
      const size = plan.square.size * this.transform.scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(artwork, x, y, size, size);
      ctx.restore();
    }
  }
}

function scaleAbout(poly: readonly Point[], cx: number, cy: number, k: number): Point[] {
  return poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as Point);
}
