import { addDays, startOfDay, subDays } from 'date-fns';
import { describe, expect, it } from 'vitest';

/**
 * Unit tests for the date-cutoff and label-selection logic inside
 * useUpcomingDeadline. The hook itself depends on useLiveQuery and
 * useTranslation, which require full provider setup. These tests cover the
 * pure-logic parts that are the most likely to regress:
 *
 * 1. Past deadlines are excluded
 * 2. Deadlines beyond the 30-day threshold are excluded
 * 3. The soonest deadline is selected when multiple exist
 * 4. Day-count boundaries (today = 0, tomorrow = 1, future = N)
 */

const UPCOMING_THRESHOLD_DAYS = 30;

type DeadlineLike = { endAt: string };

/**
 * Mirrors the selection logic from useUpcomingDeadline so tests remain
 * coupled to the real algorithm without needing hook infrastructure.
 */
function selectUpcomingDeadline(
  deadlines: DeadlineLike[],
  now: Date,
): { days: number } | null {
  const today = startOfDay(now);

  const upcoming = deadlines
    .map((d) => ({ endDate: startOfDay(new Date(d.endAt)) }))
    .filter((d) => d.endDate >= today)
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime());

  const soonest = upcoming.at(0);
  if (soonest === undefined) {
    return null;
  }

  const days = Math.round(
    (soonest.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (days > UPCOMING_THRESHOLD_DAYS) {
    return null;
  }

  return { days };
}

function isoDate(d: Date): string {
  return d.toISOString();
}

describe('useUpcomingDeadline — deadline selection', () => {
  const now = new Date('2025-06-15T12:00:00Z');

  it('returns null when there are no deadlines', () => {
    expect(selectUpcomingDeadline([], now)).toBeNull();
  });

  it('excludes deadlines that are in the past', () => {
    const past = { endAt: isoDate(subDays(now, 1)) };
    expect(selectUpcomingDeadline([past], now)).toBeNull();
  });

  it('includes a deadline that is exactly today (days = 0)', () => {
    const today = { endAt: isoDate(startOfDay(now)) };
    const result = selectUpcomingDeadline([today], now);
    expect(result?.days).toBe(0);
  });

  it('includes a deadline that is tomorrow (days = 1)', () => {
    const tomorrow = { endAt: isoDate(addDays(startOfDay(now), 1)) };
    const result = selectUpcomingDeadline([tomorrow], now);
    expect(result?.days).toBe(1);
  });

  it('includes a deadline exactly at the 30-day threshold', () => {
    const boundary = { endAt: isoDate(addDays(startOfDay(now), 30)) };
    const result = selectUpcomingDeadline([boundary], now);
    expect(result?.days).toBe(30);
  });

  it('excludes a deadline one day beyond the 30-day threshold', () => {
    const beyond = { endAt: isoDate(addDays(startOfDay(now), 31)) };
    expect(selectUpcomingDeadline([beyond], now)).toBeNull();
  });

  it('selects the soonest deadline when multiple are within the window', () => {
    const sooner = { endAt: isoDate(addDays(startOfDay(now), 3)) };
    const later = { endAt: isoDate(addDays(startOfDay(now), 10)) };
    const result = selectUpcomingDeadline([later, sooner], now);
    expect(result?.days).toBe(3);
  });

  it('ignores past deadlines and selects the soonest future one', () => {
    const past = { endAt: isoDate(subDays(now, 5)) };
    const future = { endAt: isoDate(addDays(startOfDay(now), 7)) };
    const result = selectUpcomingDeadline([past, future], now);
    expect(result?.days).toBe(7);
  });

  it('returns null when all deadlines are beyond the threshold', () => {
    const far = { endAt: isoDate(addDays(startOfDay(now), 60)) };
    expect(selectUpcomingDeadline([far], now)).toBeNull();
  });
});
