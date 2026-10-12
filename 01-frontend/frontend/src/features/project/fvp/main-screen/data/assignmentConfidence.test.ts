import { describe, expect, it } from 'vitest';

import {
  FVP_ASSIGNMENT_CONFIDENCE_THRESHOLD,
  isUncertainAssignmentConfidence,
} from './assignmentConfidence';

describe('isUncertainAssignmentConfidence', () => {
  it('treats a finite value strictly below the threshold as uncertain', () => {
    expect(isUncertainAssignmentConfidence(0.79)).toBe(true);
    expect(FVP_ASSIGNMENT_CONFIDENCE_THRESHOLD).toBe(0.8);
  });

  it('treats the threshold and higher values as confident', () => {
    expect(isUncertainAssignmentConfidence(0.8)).toBe(false);
    expect(isUncertainAssignmentConfidence(1)).toBe(false);
  });

  it('never treats missing or non-finite values as uncertain', () => {
    expect(isUncertainAssignmentConfidence(null)).toBe(false);
    expect(isUncertainAssignmentConfidence(undefined)).toBe(false);
    expect(isUncertainAssignmentConfidence(Number.NaN)).toBe(false);
  });
});
