import { describe, expect, it } from 'vitest';
import {
  getFakeProgressPercent,
  getFakeRemainingMinutes,
} from './fakeProgress';

describe('fake progress helpers', () => {
  it('calculates progress for a six hour estimate', () => {
    expect(
      getFakeProgressPercent({
        estimatedDurationMs: 6 * 60 * 60_000,
        now: 3 * 60 * 60_000,
        startedAt: 0,
      }),
    ).toBe(50);
  });

  it('calculates progress for a twenty four hour estimate', () => {
    expect(
      getFakeProgressPercent({
        estimatedDurationMs: 24 * 60 * 60_000,
        now: 6 * 60 * 60_000,
        startedAt: 0,
      }),
    ).toBe(25);
  });

  it('keeps a visible minimum while processing', () => {
    expect(
      getFakeProgressPercent({
        estimatedDurationMs: 24 * 60 * 60_000,
        now: 0,
        startedAt: 0,
      }),
    ).toBe(1);
  });

  it('caps running progress at ninety percent', () => {
    expect(
      getFakeProgressPercent({
        estimatedDurationMs: 6 * 60 * 60_000,
        now: 12 * 60 * 60_000,
        startedAt: 0,
      }),
    ).toBe(90);
  });

  it('shows completed progress at one hundred percent', () => {
    expect(
      getFakeProgressPercent({
        estimatedDurationMs: 6 * 60 * 60_000,
        isDone: true,
        now: 12 * 60 * 60_000,
        startedAt: 0,
      }),
    ).toBe(100);
  });

  it('returns at least one remaining minute while processing', () => {
    expect(
      getFakeRemainingMinutes({
        estimatedDurationMs: 60_000,
        now: 59_999,
        startedAt: 0,
      }),
    ).toBe(1);
  });
});
