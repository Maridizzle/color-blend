import type { Lattice } from '../puzzle/lattice';
import { type BoardTransform, tracePolygon } from './transform';

/**
 * Hit testing via an offscreen ID buffer.
 *
 * Each cell is painted into a hidden canvas in a color that encodes its id, so
 * a tap is one getImageData read regardless of tile shape or count. Beats
 * point-in-polygon because it is exact for hexagons, triangles and masked
 * silhouettes alike with no per-shape math, and it stays O(1) as boards grow.
 *
 * Polygons are drawn *un-inset* here, so the visual gutters between tiles still
 * belong to their nearest tile and near-misses land where the player meant.
 */
export class PickingBuffer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;

  rebuild(lattice: Lattice, transform: BoardTransform, width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));

    if (!this.canvas) this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!this.ctx) return;

    this.ctx.clearRect(0, 0, this.width, this.height);
    for (const cell of lattice.cells) {
      this.ctx.fillStyle = encodeId(cell.id);
      tracePolygon(this.ctx, cell.poly, transform);
      this.ctx.fill();
      // Stroke as well so seams between adjacent polygons are covered rather
      // than leaving hairline gaps that read as "no tile here".
      this.ctx.strokeStyle = this.ctx.fillStyle;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }
  }

  /** Cell id at a canvas-space point, or null if the point missed the board. */
  pick(x: number, y: number): number | null {
    if (!this.ctx) return null;
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return null;

    const [r, g, b, a] = this.ctx.getImageData(px, py, 1, 1).data;
    if ((a ?? 0) < 128) return null;
    return decodeId(r ?? 0, g ?? 0, b ?? 0);
  }
}

/** Cell ids are offset by one so id 0 does not collide with transparent black. */
function encodeId(id: number): string {
  const v = id + 1;
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  return `rgb(${r},${g},${b})`;
}

function decodeId(r: number, g: number, b: number): number | null {
  const v = (r << 16) | (g << 8) | b;
  return v === 0 ? null : v - 1;
}
