/**
 * Silhouette masks.
 *
 * Each takes normalized 0..1 lattice coordinates and answers "is this cell part
 * of the shape". Combined with `maskLattice` this is how a board becomes a
 * circle, a leaf or an arch while still resolving to a square artwork on solve.
 */

export type ShapeMask = (u: number, v: number) => boolean;

export type ShapeName =
  | 'full'
  | 'circle'
  | 'hexagon'
  | 'diamond'
  | 'leaf'
  | 'arch'
  | 'squircle';

const full: ShapeMask = () => true;

const circle: ShapeMask = (u, v) => {
  const dx = u - 0.5;
  const dy = v - 0.5;
  return dx * dx + dy * dy <= 0.25;
};

/** Superellipse with exponent 4: a square with generously rounded corners. */
const squircle: ShapeMask = (u, v) => {
  const dx = Math.abs(u - 0.5) / 0.5;
  const dy = Math.abs(v - 0.5) / 0.5;
  return Math.pow(dx, 4) + Math.pow(dy, 4) <= 1;
};

const diamond: ShapeMask = (u, v) => Math.abs(u - 0.5) + Math.abs(v - 0.5) <= 0.5;

/**
 * Point-in-convex-polygon by consistent winding sign. Vertices must be given in
 * order; a small epsilon keeps cells sitting exactly on an edge inside.
 */
function insidePolygon(u: number, v: number, poly: readonly (readonly [number, number])[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i] as readonly [number, number];
    const [bx, by] = poly[(i + 1) % poly.length] as readonly [number, number];
    const cross = (bx - ax) * (v - ay) - (by - ay) * (u - ax);
    if (cross > 1e-9) {
      if (sign < 0) return false;
      sign = 1;
    } else if (cross < -1e-9) {
      if (sign > 0) return false;
      sign = -1;
    }
  }
  return true;
}

/** Regular polygon inscribed in the unit square, rotated by `offset` degrees. */
function regularPolygon(sides: number, offsetDeg: number): readonly [number, number][] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = ((360 / sides) * i + offsetDeg) * (Math.PI / 180);
    return [0.5 + 0.5 * Math.cos(angle), 0.5 + 0.5 * Math.sin(angle)] as [number, number];
  });
}

const HEXAGON_POLY = regularPolygon(6, 0);
const hexagon: ShapeMask = (u, v) => insidePolygon(u, v, HEXAGON_POLY);

/**
 * Vesica-style leaf: the lens where two unit circles centered on opposite
 * corners overlap, which gives a pointed shape along the diagonal.
 */
const leaf: ShapeMask = (u, v) => {
  const a = u * u + v * v <= 1.0;
  const b = (1 - u) * (1 - u) + (1 - v) * (1 - v) <= 1.0;
  return a && b;
};

/** Rectangle below, semicircle above. */
const arch: ShapeMask = (u, v) => {
  if (v >= 0.45) return Math.abs(u - 0.5) <= 0.42;
  const dx = (u - 0.5) / 0.42;
  const dy = (v - 0.45) / 0.45;
  return dx * dx + dy * dy <= 1;
};

export const SHAPES: Record<ShapeName, ShapeMask> = {
  full,
  circle,
  hexagon,
  diamond,
  leaf,
  arch,
  squircle,
};

export const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];
