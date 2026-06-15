import { describe, expect, it } from 'vitest';
import {
  getFakeWorkflowProgressPrediction,
  getWorkflowRemainingTimeEstimate,
  getWorkflowStartedAtMs,
  getWorkflowStartTimeMs,
} from './workflowProgressPrediction';

const MS_PER_MINUTE = 60_000;

describe('workflowProgressPrediction', () => {
  it('parses workflow start times', () => {
    expect(getWorkflowStartTimeMs('2026-05-08T00:00:00.000Z')).toBe(
      Date.parse('2026-05-08T00:00:00.000Z'),
    );
    expect(getWorkflowStartTimeMs(null)).toBeUndefined();
    expect(getWorkflowStartTimeMs('not-a-date')).toBeUndefined();
  });

  it('falls back when the workflow start time is missing or invalid', () => {
    expect(
      getWorkflowStartedAtMs({
        fallbackStartedAt: 123,
        workflowStartedAt: undefined,
      }),
    ).toBe(123);
    expect(
      getWorkflowStartedAtMs({
        fallbackStartedAt: 123,
        workflowStartedAt: 'not-a-date',
      }),
    ).toBe(123);
  });

  it('returns remaining time as hours or minutes', () => {
    expect(
      getWorkflowRemainingTimeEstimate({
        estimatedDurationMs: 90 * MS_PER_MINUTE,
        now: 30 * MS_PER_MINUTE,
        startedAt: 0,
      }),
    ).toEqual({ count: 1, unit: 'hours' });
    expect(
      getWorkflowRemainingTimeEstimate({
        estimatedDurationMs: 45 * MS_PER_MINUTE,
        now: 30 * MS_PER_MINUTE,
        startedAt: 0,
      }),
    ).toEqual({ count: 15, unit: 'minutes' });
  });

  it('returns the fake progress view model for a workflow', () => {
    expect(
      getFakeWorkflowProgressPrediction({
        estimatedDurationMs: 100 * MS_PER_MINUTE,
        fallbackStartedAt: 0,
        now: 25 * MS_PER_MINUTE,
        workflow: {
          workflow_start_time: new Date(0).toISOString(),
        },
      }),
    ).toEqual({
      progressPercent: 25,
      remainingTime: { count: 2, unit: 'hours' },
      startedAt: 0,
      status: 'running',
    });
  });

  it('marks long-running fake progress as over estimate', () => {
    expect(
      getFakeWorkflowProgressPrediction({
        estimatedDurationMs: 100 * MS_PER_MINUTE,
        fallbackStartedAt: 0,
        now: 200 * MS_PER_MINUTE,
        workflow: {
          workflow_start_time: new Date(0).toISOString(),
        },
      }).status,
    ).toBe('overEstimate');
  });

  it('marks done fake progress as complete', () => {
    expect(
      getFakeWorkflowProgressPrediction({
        estimatedDurationMs: 100 * MS_PER_MINUTE,
        fallbackStartedAt: 0,
        isDone: true,
        now: 25 * MS_PER_MINUTE,
        workflow: {
          workflow_start_time: new Date(0).toISOString(),
        },
      }),
    ).toMatchObject({
      progressPercent: 100,
      status: 'done',
    });
  });
});
