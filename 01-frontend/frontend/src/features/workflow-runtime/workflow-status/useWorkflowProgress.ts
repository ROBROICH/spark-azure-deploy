import { useEffect, useMemo, useState } from 'react';
import {
  getFakeWorkflowProgressPrediction,
  type WorkflowStartTimeSource,
} from './workflowProgressPrediction';

type UseWorkflowProgressOptions = {
  estimatedDurationMs: number;
  isDone?: boolean;
  isRunning?: boolean;
  /**
   * Tick interval for the progress timer, in ms. Defaults to one second.
   * Long-running workflows whose UI only shows minute/hour-granular remaining
   * time can pass a coarser value to avoid per-second re-renders.
   */
  refreshIntervalMs?: number;
  workflow: WorkflowStartTimeSource;
};

type WorkflowProgressClock = {
  fallbackStartedAt: number;
  now: number;
};

export const useWorkflowProgress = (options: UseWorkflowProgressOptions) => {
  const {
    estimatedDurationMs,
    isDone = false,
    isRunning = !isDone,
    refreshIntervalMs = 1000,
    workflow,
  } = options;
  // eslint-disable-next-line no-restricted-syntax -- progress display needs a local clock tick while the workflow is running.
  const [clock, setClock] = useState<WorkflowProgressClock>(() => {
    const startedAt = Date.now();

    return {
      fallbackStartedAt: startedAt,
      now: startedAt,
    };
  });

  // eslint-disable-next-line no-restricted-syntax -- progress bars are time-based and need a browser timer while the workflow is running.
  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const interval = window.setInterval(
      () =>
        setClock((currentClock) => ({
          ...currentClock,
          now: Date.now(),
        })),
      refreshIntervalMs,
    );

    return () => window.clearInterval(interval);
  }, [isRunning, refreshIntervalMs]);

  // eslint-disable-next-line no-restricted-syntax -- hook consumers may prop-drill this workflow progress object, so keep the returned object stable between timer/config changes.
  return useMemo(() => {
    const progressPrediction = getFakeWorkflowProgressPrediction({
      estimatedDurationMs,
      fallbackStartedAt: clock.fallbackStartedAt,
      isDone,
      now: clock.now,
      workflow,
    });

    return {
      progress: progressPrediction.progressPercent / 100,
      remainingTime: progressPrediction.remainingTime,
      startedAt: progressPrediction.startedAt,
      status: progressPrediction.status,
    };
  }, [
    clock.fallbackStartedAt,
    clock.now,
    estimatedDurationMs,
    isDone,
    workflow,
  ]);
};

export type WorkflowProgress = ReturnType<typeof useWorkflowProgress>;
