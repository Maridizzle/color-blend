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
  | 'squircle'
  | 'triangle'
  | 'octagon'
  | 'ring'
  | 'crescent'
  | 'star'
  | 'cross';

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
 * Point-in-polygon by ray casting. Handles concave outlines, which the winding
 * -sign test this replaced could not -- a star is the whole reason it matters.
 */
function insidePolygon(u: number, v: number, poly: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[i] as readonly [number, number];
    const [bx, by] = poly[j] as readonly [number, number];
    if (ay > v !== by > v && u < ((bx - ax) * (v - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
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

const TRIANGLE_POLY = regularPolygon(3, -90);
const triangle: ShapeMask = (u, v) => insidePolygon(u, v, TRIANGLE_POLY);

const OCTAGON_POLY = regularPolygon(8, 22.5);
const octagon: ShapeMask = (u, v) => insidePolygon(u, v, OCTAGON_POLY);

/**
 * Annulus. The hole is deliberately small: a ring has to stay wide enough to
 * hold two or three tiles all the way round, or `maskLattice` drops the
 * orphaned cells and what is left is a broken circle rather than a ring.
 */
const ring: ShapeMask = (u, v) => {
  const d = Math.hypot(u - 0.5, v - 0.5);
  return d <= 0.5 && d >= 0.23;
};

/**
 * A disc with a second disc bitten out of one side.
 *
 * Both are ellipses squashed vertically rather than circles, because a crescent
 * cut from a circle is intrinsically tall and narrow -- its horns span the full
 * height while the bite eats most of the width, giving a board around 0.6 aspect
 * whatever the bite is doing. Squashing the outer boundary brings it back to
 * roughly square, which is what the shape gate in `difficulty.ts` requires and
 * what stops it rendering as a sliver.
 */
const CRESCENT_RY = 0.32;
const crescent: ShapeMask = (u, v) => {
  const outer = ((u - 0.5) / 0.5) ** 2 + ((v - 0.5) / CRESCENT_RY) ** 2 <= 1;
  const biteRy = (CRESCENT_RY * 0.42) / 0.5;
  const bite = ((u - 0.78) / 0.42) ** 2 + ((v - 0.5) / biteRy) ** 2 <= 1;
  return outer && !bite;
};

/**
 * Five-pointed star: alternating outer and inner vertices. Concave, so this is
 * what the ray-cast point-in-polygon above exists for.
 */
const STAR_POLY: readonly [number, number][] = Array.from({ length: 10 }, (_, i) => {
  const radius = i % 2 === 0 ? 0.5 : 0.21;
  const angle = (i * 36 - 90) * (Math.PI / 180);
  return [0.5 + radius * Math.cos(angle), 0.5 + radius * Math.sin(angle)];
});
const star: ShapeMask = (u, v) => insidePolygon(u, v, STAR_POLY);

/** Greek cross: two bars of equal width crossing at the centre. */
const cross: ShapeMask = (u, v) => {
  const du = Math.abs(u - 0.5);
  const dv = Math.abs(v - 0.5);
  return (du <= 0.19 && dv <= 0.5) || (dv <= 0.19 && du <= 0.5);
};

export const SHAPES: Record<ShapeName, ShapeMask> = {
  full,
  circle,
  hexagon,
  diamond,
  leaf,
  arch,
  squircle,
  triangle,
  octagon,
  ring,
  crescent,
  star,
  cross,
};

export const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];

/**
 * Tiles a shape needs before it reads as that shape rather than as a board with
 * bits missing.
 *
 * This was one blanket number for every silhouette, which was too blunt in both
 * directions: a circle of twelve tiles is perfectly obviously a circle, while a
 * five-pointed star needs enough cells that its points survive being carved out
 * at all. Sorted roughly by how much detail the outline has to spend.
 */
export const SHAPE_MIN_TILES: Record<ShapeName, number> = {
  full: 0,
  circle: 8,
  diamond: 8,
  squircle: 8,
  hexagon: 10,
  triangle: 10,
  cross: 12,
  octagon: 14,
  leaf: 14,
  arch: 14,
  ring: 18,
  crescent: 18,
  star: 22,
};
