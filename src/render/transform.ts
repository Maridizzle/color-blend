import type { Lattice, Point } from '../puzzle/lattice';

/** Maps lattice board units onto canvas pixels, centered with padding. */
export interface BoardTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function fitTransform(
  lattice: Lattice,
  canvasWidth: number,
  canvasHeight: number,
  padding: number,
): BoardTransform {
  const availableW = Math.max(1, canvasWidth - padding * 2);
  const availableH = Math.max(1, canvasHeight - padding * 2);
  const scale = Math.min(availableW / lattice.width, availableH / lattice.height);
  return {
    scale,
    offsetX: (canvasWidth - lattice.width * scale) / 2,
    offsetY: (canvasHeight - lattice.height * scale) / 2,
  };
}

export function project(t: BoardTransform, x: number, y: number): [number, number] {
  return [t.offsetX + x * t.scale, t.offsetY + y * t.scale];
}

export function unproject(t: BoardTransform, px: number, py: number): [number, number] {
  return [(px - t.offsetX) / t.scale, (py - t.offsetY) / t.scale];
}

/**
 * Shrink a polygon toward its centroid by a fixed distance in board units.
 * The resulting gutter is what makes a field of tiles read as tiles rather than
 * as one continuous blur of color.
 */
export function insetPolygon(poly: readonly Point[], amount: number): Point[] {
  if (amount <= 0) return poly.map((p) => [p[0], p[1]] as Point);

  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;

  return poly.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const distance = Math.hypot(dx, dy);
    if (distance <= amount) return [cx, cy] as Point;
    const k = (distance - amount) / distance;
    return [cx + dx * k, cy + dy * k] as Point;
  });
}

export function tracePolygon(
  ctx: CanvasRenderingContext2D,
  poly: readonly Point[],
  t: BoardTransform,
): void {
  ctx.beginPath();
  poly.forEach(([x, y], i) => {
    const [px, py] = project(t, x, y);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
}
