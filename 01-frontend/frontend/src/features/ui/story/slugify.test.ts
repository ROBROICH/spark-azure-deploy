import { describe, expect, it } from 'vitest';

import { slugify } from './slugify';

describe('slugify', () => {
  it.each([
    ['', ''],
    ['Already Slugged', 'already-slugged'],
    ['  Hello, world!  ', 'hello-world'],
    ['Section 12.4 / Appendix B', 'section-12-4-appendix-b'],
  ])('slugifies "%s"', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});
