import { describe, expect, it } from 'vitest';
import { mosaicPlan, uncoveredCells } from '../src/game/mosaic';

describe('cutting a collection mosaic', () => {
  it('gives every cell an owner, at every collection size', () => {
    // A cell owned by nobody is a patch of the picture that is either always
    // visible or never visible, and both read as a fault.
    for (let n = 1; n <= 40; n++) {
      const plan = mosaicPlan(n);
      const owned = plan.cellsBySubject.flat();
      expect(plan.cellsBySubject, `n=${n}`).toHaveLength(n);
      expect(owned.length, `n=${n}`).toBe(plan.cols * plan.rows);
      expect(new Set(owned).size, `n=${n}`).toBe(owned.length);
      expect([...owned].sort((a, b) => a - b), `n=${n}`).toEqual(
        Array.from({ length: plan.cols * plan.rows }, (_, i) => i),
      );
    }
  });

  it('gives every subject at least one cell, and shares the surplus evenly', () => {
    for (let n = 1; n <= 40; n++) {
      const sizes = mosaicPlan(n).cellsBySubject.map((c) => c.length);
      expect(Math.min(...sizes), `n=${n}`).toBeGreaterThanOrEqual(1);
      // Nobody gets two more than anybody else.
      expect(Math.max(...sizes) - Math.min(...sizes), `n=${n}`).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the grid close to square', () => {
    for (let n = 2; n <= 40; n++) {
      const { cols, rows } = mosaicPlan(n);
      expect(cols * rows, `n=${n}`).toBeGreaterThanOrEqual(n);
      expect(Math.abs(cols - rows), `n=${n}`).toBeLessThanOrEqual(1);
    }
  });

  it('matches the shipped collections', () => {
    expect(mosaicPlan(11).cols).toBe(4);
    expect(mosaicPlan(11).rows).toBe(3);
    expect(mosaicPlan(9)).toMatchObject({ cols: 3, rows: 3 });
    expect(mosaicPlan(7)).toMatchObject({ cols: 3, rows: 3 });
    // Nine subjects over nine cells is one each; eleven over twelve is not.
    expect(mosaicPlan(9).cellsBySubject.every((c) => c.length === 1)).toBe(true);
    expect(mosaicPlan(11).cellsBySubject[0]).toHaveLength(2);
  });

  it('fills in as puzzles are solved, and only then', () => {
    const plan = mosaicPlan(9);
    expect(uncoveredCells(plan, new Array(9).fill(false)).size).toBe(0);
    expect(uncoveredCells(plan, new Array(9).fill(true)).size).toBe(9);

    const some = new Array(9).fill(false);
    some[0] = true;
    some[4] = true;
    expect([...uncoveredCells(plan, some)].sort((a, b) => a - b)).toEqual([0, 4]);
  });
});
