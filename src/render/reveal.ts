import { averageRegion, type ImageData8 } from '../color/image';
import { rgbToHex } from '../color/oklab';
import type { Lattice } from '../puzzle/lattice';

/**
 * The reveal.
 *
 * A board can be a hexagon, a leaf or an arch, but the artwork underneath is
 * always square -- so solving does not just recolor the tiles, it physically
 * reflows them into a square mosaic and then crossfades that mosaic to the real
 * image. This plans where every tile has to travel and what color it becomes.
 *
 * Tiles are matched to mosaic cells by rank rather than by position, sorted top
 * to bottom then left to right. That keeps the rough spatial relationship (what
 * was at the top of the board stays at the top of the picture) while
 * guaranteeing a one-to-one mapping even for a silhouette whose rows hold
 * wildly different numbers of tiles.
 */

export interface RevealPlan {
  /** By cell id: where that tile ends up, in board units. */
  targetCx: number[];
  targetCy: number[];
  /** By cell id: how much to scale the tile about its centroid. */
  targetScale: number[];
  /** By cell id: the artwork's color there, as a CSS string. */
  targetColor: string[];
  /** The square the artwork occupies, in board units. */
  square: { x: number; y: number; size: number };
}

/** Mean distance from a polygon's centroid to its vertices. */
function polygonRadius(poly: readonly (readonly [number, number])[]): number {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return poly.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / poly.length;
}

export function buildRevealPlan(lattice: Lattice, artwork: ImageData8): RevealPlan {
  const n = lattice.cells.length;
  const side = Math.min(lattice.width, lattice.height);
  const square = {
    x: (lattice.width - side) / 2,
    y: (lattice.height - side) / 2,
    size: side,
  };

  // Rows are derived from the columns rather than both being ceil(sqrt(n)).
  // Using one number for both leaves the mosaic short of the bottom of the
  // square whenever n is not a perfect square: at 12 tiles that is a 4x4 grid
  // with three rows filled, so a quarter of the picture stays blank through the
  // whole morph. Sizing cells per axis makes the mosaic cover the square
  // exactly, and the authored counts divide cleanly anyway (12 = 4x3,
  // 20 = 5x4, 30 = 6x5).
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cellWidth = side / cols;
  const cellHeight = side / rows;

  // A last row that cannot be filled is centred, so the gap sits either side
  // rather than hanging off one end.
  const lastRowCount = n - (rows - 1) * cols;
  const lastRowOffset = ((cols - lastRowCount) * cellWidth) / 2;

  const ranked = [...lattice.cells].sort((a, b) => a.v - b.v || a.u - b.u);

  const targetCx = new Array<number>(n).fill(0);
  const targetCy = new Array<number>(n).fill(0);
  const targetScale = new Array<number>(n).fill(1);
  const targetColor = new Array<string>(n).fill('#000');

  ranked.forEach((cell, rank) => {
    const col = rank % cols;
    const row = Math.floor(rank / cols);
    const inset = row === rows - 1 ? lastRowOffset : 0;

    targetCx[cell.id] = square.x + inset + (col + 0.5) * cellWidth;
    targetCy[cell.id] = square.y + (row + 0.5) * cellHeight;

    // Scale to the smaller side, so a tile never overflows a non-square cell.
    const radius = polygonRadius(cell.poly);
    targetScale[cell.id] = radius > 0 ? Math.min(cellWidth, cellHeight) / 2 / radius : 1;

    const rgb = averageRegion(
      artwork,
      col / cols,
      row / rows,
      (col + 1) / cols,
      (row + 1) / rows,
    );
    targetColor[cell.id] = rgb ? rgbToHex(rgb) : '#000';
  });

  return { targetCx, targetCy, targetScale, targetColor, square };
}

export type RevealPhase = 'idle' | 'settle' | 'morph' | 'crossfade' | 'done';

export const REVEAL_TIMINGS = {
  /** Beat before anything moves, so the player registers that they finished. */
  settle: 420,
  morph: 1100,
  crossfade: 700,
} as const;

export interface RevealState {
  phase: RevealPhase;
  /** 0..1 within the current phase. */
  t: number;
}

/** Where the reveal is, given milliseconds since the solve. */
export function revealStateAt(elapsed: number, reducedMotion: boolean): RevealState {
  const timings = reducedMotion
    ? { settle: 120, morph: 260, crossfade: 200 }
    : REVEAL_TIMINGS;

  if (elapsed < timings.settle) {
    return { phase: 'settle', t: elapsed / timings.settle };
  }
  const afterSettle = elapsed - timings.settle;
  if (afterSettle < timings.morph) {
    return { phase: 'morph', t: afterSettle / timings.morph };
  }
  const afterMorph = afterSettle - timings.morph;
  if (afterMorph < timings.crossfade) {
    return { phase: 'crossfade', t: afterMorph / timings.crossfade };
  }
  return { phase: 'done', t: 1 };
}

export function totalRevealDuration(reducedMotion: boolean): number {
  return reducedMotion
    ? 120 + 260 + 200
    : REVEAL_TIMINGS.settle + REVEAL_TIMINGS.morph + REVEAL_TIMINGS.crossfade;
}
