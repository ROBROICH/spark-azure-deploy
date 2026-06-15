import { describe, expect, it } from 'vitest';
import { formatNodeNumber, toRoman } from './outlineNumbering';

describe('toRoman', () => {
  it('converts index 0 to I', () => {
    expect(toRoman(0)).toBe('I');
  });

  it('converts index 3 to IV', () => {
    expect(toRoman(3)).toBe('IV');
  });

  it('converts index 8 to IX', () => {
    expect(toRoman(8)).toBe('IX');
  });

  it('converts index 13 to XIV', () => {
    expect(toRoman(13)).toBe('XIV');
  });
});

describe('formatNodeNumber', () => {
  it('uses uppercase letters for depth 0', () => {
    expect(formatNodeNumber(0, [0])).toBe('A');
    expect(formatNodeNumber(0, [2])).toBe('C');
  });

  it('uses roman numerals for depth 1', () => {
    expect(formatNodeNumber(1, [0, 0])).toBe('I');
    expect(formatNodeNumber(1, [0, 4])).toBe('V');
  });

  it('uses arabic numbers for depth 2', () => {
    expect(formatNodeNumber(2, [0, 0, 0])).toBe('1');
    expect(formatNodeNumber(2, [0, 0, 2])).toBe('3');
  });

  it('chains arabic numbers from depth 2 for deeper levels', () => {
    expect(formatNodeNumber(3, [0, 0, 1, 0])).toBe('2.1');
    expect(formatNodeNumber(4, [0, 0, 1, 0, 0])).toBe('2.1.1');
    expect(formatNodeNumber(5, [0, 0, 1, 0, 0, 0])).toBe('2.1.1.1');
  });
});
