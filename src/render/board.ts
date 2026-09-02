import type { Cell, Lattice, Point } from '../puzzle/lattice';
import { PickingBuffer } from './picking';
import {
  type BoardTransform,
  fitTransform,
  insetPolygon,
  project,
  tracePolygon,
} from './transform';
import type { RevealPlan, RevealState } from './reveal';

/** Everything the renderer needs to draw one frame. */
export interface BoardView {
  /** CSS color currently sitting in each cell, by cell id. */
  colors: string[];
  /** Perceptual lightness 0..1 per cell, for the accessibility overlay. */
  lightness: number[];
  locked: boolean[];
  selection: number | null;
  /** A swap in flight: the two tiles slide past each other. */
  swap: { a: number; b: number; colorA: string; colorB: string; t: number } | null;
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
    const typicalCell = Math.sqrt(
      (this.lattice.width * this.lattice.height) / this.lattice.cells.length,
    );
    this.gutter = Math.min(typicalCell * 0.06, typicalCell * 0.5);

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

  draw(view: BoardView): void {
    const { ctx, lattice } = this;
    if (!lattice) return;

    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (view.reveal && view.reveal.state.phase !== 'settle') {
      this.drawReveal(view, view.reveal);
      return;
    }

    for (const cell of lattice.cells) {
      const inFlight = view.swap && (cell.id === view.swap.a || cell.id === view.swap.b);
      if (inFlight) {
        this.fillCell(cell, EMPTY_CELL, 1);
        continue;
      }
      const pulse = view.pulses.get(cell.id);
      this.fillCell(cell, view.colors[cell.id] ?? '#000', 1, pulse);
      if (view.locked[cell.id]) this.drawLockMark(cell);
      if (view.lightnessAssist) this.drawLightnessMark(cell, view.lightness[cell.id] ?? 0);
    }

    if (view.swap) this.drawSwap(view.swap);
    if (view.selection !== null) this.drawSelection(view.selection);
  }

  private fillCell(cell: Cell, color: string, alpha: number, pulse?: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;

    let poly: readonly Point[] = insetPolygon(cell.poly, this.gutter);
    if (pulse !== undefined && pulse > 0) {
      // Brief swell outward when a fact tile lands, drawing the eye to it.
      const swell = Math.sin(pulse * Math.PI) * 0.18;
      poly = scaleAbout(poly, cell.cx, cell.cy, 1 + swell);
    }

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
    const cellPx = Math.sqrt(
      ((this.lattice?.width ?? 1) * (this.lattice?.height ?? 1)) /
        Math.max(1, this.lattice?.cells.length ?? 1),
    ) * this.transform.scale;
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

  private drawSelection(cellId: number): void {
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

  /** Two tiles physically trade places rather than blinking into their new colors. */
  private drawSwap(swap: NonNullable<BoardView['swap']>): void {
    const a = this.lattice?.cells[swap.a];
    const b = this.lattice?.cells[swap.b];
    if (!a || !b) return;

    const t = easeInOut(swap.t);
    const { ctx } = this;

    const fly = (from: Cell, to: Cell, color: string) => {
      const dx = (to.cx - from.cx) * t;
      const dy = (to.cy - from.cy) * t;
      // Slight lift at the midpoint so the two tiles read as passing each other
      // rather than sliding through one another.
      const lift = 1 + Math.sin(t * Math.PI) * 0.1;
      const poly = scaleAbout(
        insetPolygon(from.poly, this.gutter).map(([x, y]) => [x + dx, y + dy] as Point),
        from.cx + dx,
        from.cy + dy,
        lift,
      );
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 12 * this.dpr * Math.sin(t * Math.PI);
      tracePolygon(ctx, poly, this.transform);
      ctx.fill();
      ctx.restore();
    };

    fly(a, b, swap.colorA);
    fly(b, a, swap.colorB);
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
