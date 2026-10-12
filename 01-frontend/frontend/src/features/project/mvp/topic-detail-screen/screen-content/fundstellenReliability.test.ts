import { describe, expect, it } from 'vitest';

import {
  countCarryingFundstellen,
  doesFundstelleCarryAssessment,
  getFundstellenReliabilityLevel,
} from './fundstellenReliability';

describe('getFundstellenReliabilityLevel', () => {
  it('returns no level for a finding without a confidence value', () => {
    expect(getFundstellenReliabilityLevel(null)).toBeUndefined();
    expect(getFundstellenReliabilityLevel(undefined)).toBeUndefined();
  });

  it('maps the boundary and everything above it to the carrying level', () => {
    expect(getFundstellenReliabilityLevel(0.6)).toBe('carries');
    expect(getFundstellenReliabilityLevel(1)).toBe('carries');
  });

  it('maps everything below the boundary to the supplementary level', () => {
    expect(getFundstellenReliabilityLevel(0.59)).toBe('supplementary');
    expect(getFundstellenReliabilityLevel(0)).toBe('supplementary');
  });

  it('returns no level for a value that is not a number', () => {
    expect(getFundstellenReliabilityLevel(Number.NaN)).toBeUndefined();
  });
});

describe('doesFundstelleCarryAssessment', () => {
  it('holds at the boundary and above', () => {
    expect(doesFundstelleCarryAssessment(0.6)).toBe(true);
    expect(doesFundstelleCarryAssessment(1)).toBe(true);
  });

  it('does not hold below the boundary', () => {
    expect(doesFundstelleCarryAssessment(0.59)).toBe(false);
  });

  it('does not hold without a value, because nothing is known about it', () => {
    expect(doesFundstelleCarryAssessment(null)).toBe(false);
    expect(doesFundstelleCarryAssessment(undefined)).toBe(false);
  });
});

describe('countCarryingFundstellen', () => {
  it('counts only the findings at or above the boundary', () => {
    expect(
      countCarryingFundstellen([
        { confidence: 0.9 },
        { confidence: 0.6 },
        { confidence: 0.59 },
        { confidence: null },
        {},
      ]),
    ).toBe(2);
  });

  it('counts nothing in an empty list', () => {
    expect(countCarryingFundstellen([])).toBe(0);
  });
});
