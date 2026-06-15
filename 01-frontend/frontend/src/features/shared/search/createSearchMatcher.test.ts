import { describe, expect, it } from 'vitest';

import { createSearchMatcher } from './createSearchMatcher';

describe('createSearchMatcher', () => {
  it('matches umlaut search terms against plain vowels', () => {
    const matcher = createSearchMatcher('geschwä');

    expect(matcher('Geschwasser')).toBe(true);
  });

  it('matches umlaut search terms against ae fallbacks', () => {
    expect(createSearchMatcher('geschwä')('Geschwaesser')).toBe(true);
    expect(createSearchMatcher('geschwae')('Geschwässer')).toBe(true);
  });

  it('matches decomposed umlauts', () => {
    const matcher = createSearchMatcher('geschwä');

    expect(matcher('Geschwa\u0308sser')).toBe(true);
  });

  it('keeps unrelated terms from matching', () => {
    const matcher = createSearchMatcher('geschwä');

    expect(matcher('Anforderung')).toBe(false);
  });

  it('returns a pass-through matcher for empty queries', () => {
    const matcher = createSearchMatcher('   ');

    expect(matcher('anything')).toBe(true);
    expect(matcher(undefined)).toBe(true);
  });

  it('handles nullable candidate values for non-empty queries', () => {
    const matcher = createSearchMatcher('geschwä');

    expect(matcher(undefined)).toBe(false);
    expect(matcher(null)).toBe(false);
    expect(matcher('Geschwaesser')).toBe(true);
  });
});
