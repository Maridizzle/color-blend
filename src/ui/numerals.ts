/**
 * Roman numerals, for folio and archive numbers.
 *
 * Goes past X because nothing about the road is allowed to assume a small
 * number of anything: a pack can carry sixty folios and the road can carry as
 * many archives as anyone cares to add.
 */
const NUMERALS: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function roman(value: number): string {
  if (!Number.isFinite(value) || value < 1) return '';
  let rest = Math.floor(value);
  let result = '';
  for (const [amount, glyph] of NUMERALS) {
    while (rest >= amount) {
      result += glyph;
      rest -= amount;
    }
  }
  return result;
}
