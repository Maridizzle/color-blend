import { describe, expect, it } from 'vitest';
import { roman } from '../src/ui/numerals';

describe('roman', () => {
  it('handles the small numbers the folio list has always used', () => {
    expect([1, 2, 3, 4, 5, 9, 10].map(roman)).toEqual(['I', 'II', 'III', 'IV', 'V', 'IX', 'X']);
  });

  it('keeps going past ten, which the old table could not', () => {
    expect(roman(11)).toBe('XI');
    expect(roman(42)).toBe('XLII');
    expect(roman(90)).toBe('XC');
    expect(roman(99)).toBe('XCIX');
    expect(roman(400)).toBe('CD');
    expect(roman(1994)).toBe('MCMXCIV');
  });

  it('is empty for anything that is not a positive count', () => {
    expect(roman(0)).toBe('');
    expect(roman(-3)).toBe('');
    expect(roman(Number.NaN)).toBe('');
  });
});
