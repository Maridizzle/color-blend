/**
 * Board lattices.
 *
 * A lattice is just a bag of cells with geometry and adjacency. Everything
 * downstream -- the gradient field, difficulty calibration, rendering, hit
 * testing, keyboard navigation -- consumes this interface and never asks what
 * shape the tiles are. That is what makes "squares, hexagons, triangles,
 * diamonds, and arbitrary silhouettes" one system rather than five.
 */

export type Point = readonly [number, number];

export type LatticeKind = 'square' | 'hex' | 'triangle' | 'diamond';

export interface Cell {
  id: number;
  /** Center in board units. */
  cx: number;
  cy: number;
  /**
   * Position normalized to 0..1 over the *occupied* bounds. The gradient is
   * sampled here, so masking a shape out of a grid still yields a gradient that
   * spans the surviving shape rather than the original rectangle.
   */
  u: number;
  v: number;
  /** Outline in board units, used for both drawing and hit testing. */
  poly: Point[];
  neighbors: number[];
}

export interface Lattice {
  kind: LatticeKind;
  cells: Cell[];
  /** Bounding box of the lattice in board units. */
  width: number;
  height: number;
}

const SQRT3 = Math.sqrt(3);

/** Recompute ids, normalized coords and the bounding box for a set of cells. */
function finalize(
  kind: LatticeKind,
  cells: Omit<Cell, 'id' | 'u' | 'v' | 'neighbors'>[],
  neighborKeys: string[][],
  keyOf: (index: number) => string,
): Lattice {
  const indexByKey = new Map<string, number>();
  cells.forEach((_, i) => indexByKey.set(keyOf(i), i));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    for (const [x, y] of c.poly) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const width = maxX - minX;
  const height = maxY - minY;

  const finalCells: Cell[] = cells.map((c, i) => ({
    id: i,
    cx: c.cx - minX,
    cy: c.cy - minY,
    u: width > 0 ? (c.cx - minX) / width : 0.5,
    v: height > 0 ? (c.cy - minY) / height : 0.5,
    poly: c.poly.map(([x, y]) => [x - minX, y - minY] as Point),
    neighbors: (neighborKeys[i] ?? [])
      .map((k) => indexByKey.get(k))
      .filter((n): n is number => n !== undefined),
  }));

  return { kind, cells: finalCells, width, height };
}

/** Axis-aligned square grid. Cells are unit squares; neighbors are 4-connected. */
export function squareLattice(cols: number, rows: number): Lattice {
  const cells: Omit<Cell, 'id' | 'u' | 'v' | 'neighbors'>[] = [];
  const keys: string[] = [];
  const neighborKeys: string[][] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        cx: c + 0.5,
        cy: r + 0.5,
        poly: [
          [c, r],
          [c + 1, r],
          [c + 1, r + 1],
          [c, r + 1],
        ],
      });
      keys.push(`${c},${r}`);
      neighborKeys.push([`${c - 1},${r}`, `${c + 1},${r}`, `${c},${r - 1}`, `${c},${r + 1}`]);
    }
  }
  return finalize('square', cells, neighborKeys, (i) => keys[i] as string);
}

/** Pointy-top hexagons in offset rows. Neighbors are the usual 6. */
export function hexLattice(cols: number, rows: number, size = 1): Lattice {
  const w = SQRT3 * size;
  const vSpacing = 1.5 * size;

  const cells: Omit<Cell, 'id' | 'u' | 'v' | 'neighbors'>[] = [];
  const keys: string[] = [];
  const neighborKeys: string[][] = [];

  for (let r = 0; r < rows; r++) {
    const odd = r % 2 === 1;
    for (let c = 0; c < cols; c++) {
      const cx = c * w + (odd ? w / 2 : 0) + w / 2;
      const cy = r * vSpacing + size;
      const poly: Point[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = ((60 * i - 90) * Math.PI) / 180;
        poly.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
      }
      cells.push({ cx, cy, poly });
      keys.push(`${c},${r}`);

      // On odd rows the diagonal neighbours sit at c and c+1; on even rows at
      // c-1 and c. That asymmetry is the whole trick of offset hex coordinates.
      const dLeft = odd ? c : c - 1;
      const dRight = odd ? c + 1 : c;
      neighborKeys.push([
        `${c - 1},${r}`,
        `${c + 1},${r}`,
        `${dLeft},${r - 1}`,
        `${dRight},${r - 1}`,
        `${dLeft},${r + 1}`,
        `${dRight},${r + 1}`,
      ]);
    }
  }
  return finalize('hex', cells, neighborKeys, (i) => keys[i] as string);
}

/**
 * Alternating up/down triangles. A row of `cols` triangles spans cols/2 + 0.5
 * base widths, since consecutive triangles overlap by half a base.
 */
export function triangleLattice(cols: number, rows: number, base = 1): Lattice {
  const h = (base * SQRT3) / 2;

  const cells: Omit<Cell, 'id' | 'u' | 'v' | 'neighbors'>[] = [];
  const keys: string[] = [];
  const neighborKeys: string[][] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = (c * base) / 2;
      const pointsUp = (r + c) % 2 === 0;
      const poly: Point[] = pointsUp
        ? [
            [x0, (r + 1) * h],
            [x0 + base, (r + 1) * h],
            [x0 + base / 2, r * h],
          ]
        : [
            [x0, r * h],
            [x0 + base, r * h],
            [x0 + base / 2, (r + 1) * h],
          ];
      const cx = poly.reduce((s, p) => s + p[0], 0) / 3;
      const cy = poly.reduce((s, p) => s + p[1], 0) / 3;

      cells.push({ cx, cy, poly });
      keys.push(`${c},${r}`);
      // Left and right share the slanted edges; the third neighbour shares the
      // horizontal edge and lies in the row the triangle's base faces.
      neighborKeys.push([
        `${c - 1},${r}`,
        `${c + 1},${r}`,
        pointsUp ? `${c},${r + 1}` : `${c},${r - 1}`,
      ]);
    }
  }
  return finalize('triangle', cells, neighborKeys, (i) => keys[i] as string);
}

/** Rhombus (diamond) tiling: rows offset by half a width, 4 diagonal neighbors. */
export function diamondLattice(cols: number, rows: number, w = 1, h = 1): Lattice {
  const cells: Omit<Cell, 'id' | 'u' | 'v' | 'neighbors'>[] = [];
  const keys: string[] = [];
  const neighborKeys: string[][] = [];

  for (let r = 0; r < rows; r++) {
    const odd = r % 2 === 1;
    for (let c = 0; c < cols; c++) {
      const cx = c * w + (odd ? w / 2 : 0) + w / 2;
      const cy = (r * h) / 2 + h / 2;
      cells.push({
        cx,
        cy,
        poly: [
          [cx, cy - h / 2],
          [cx + w / 2, cy],
          [cx, cy + h / 2],
          [cx - w / 2, cy],
        ],
      });
      keys.push(`${c},${r}`);
      const left = odd ? c : c - 1;
      const right = odd ? c + 1 : c;
      neighborKeys.push([
        `${left},${r - 1}`,
        `${right},${r - 1}`,
        `${left},${r + 1}`,
        `${right},${r + 1}`,
      ]);
    }
  }
  return finalize('diamond', cells, neighborKeys, (i) => keys[i] as string);
}

export function makeLattice(kind: LatticeKind, cols: number, rows: number): Lattice {
  switch (kind) {
    case 'square':
      return squareLattice(cols, rows);
    case 'hex':
      return hexLattice(cols, rows);
    case 'triangle':
      return triangleLattice(cols, rows);
    case 'diamond':
      return diamondLattice(cols, rows);
  }
}

/**
 * Carve a silhouette out of a lattice by dropping cells whose center falls
 * outside `keep`, then re-normalizing so the gradient spans what survives.
 *
 * Cells with no surviving neighbors are dropped too -- a tile floating alone
 * off the edge of the shape is a rendering wart and an unsortable orphan.
 */
export function maskLattice(
  lattice: Lattice,
  keep: (u: number, v: number) => boolean,
): Lattice {
  const survivors = lattice.cells.filter((c) => keep(c.u, c.v));
  if (survivors.length === 0) return lattice;

  const kept = new Set(survivors.map((c) => c.id));
  const connected = survivors.filter((c) => c.neighbors.some((n) => kept.has(n)));
  const finalSet = connected.length > 0 ? connected : survivors;
  const finalIds = new Set(finalSet.map((c) => c.id));

  const oldToNew = new Map<number, number>();
  finalSet.forEach((c, i) => oldToNew.set(c.id, i));

  const cells = finalSet.map((c) => ({ cx: c.cx, cy: c.cy, poly: c.poly }));
  const neighborKeys = finalSet.map((c) =>
    c.neighbors.filter((n) => finalIds.has(n)).map((n) => String(n)),
  );
  return finalize(lattice.kind, cells, neighborKeys, (i) => String((finalSet[i] as Cell).id));
}
