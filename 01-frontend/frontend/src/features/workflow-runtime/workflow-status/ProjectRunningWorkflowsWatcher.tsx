import { useLiveQuery } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useEffect, useRef } from 'react';

const WORKFLOW_COMPLETION_SUMMARY_REFETCH_DELAY_MS = 4_000;
const projectRoute = getRouteApi('/verfahren/$verfahrenId');

const canUseBrowserPolling = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Observes currently running workflows for the active project and refreshes the
 * summary tree after a known running workflow disappears from Temporal.
 */
export const ProjectRunningWorkflowsWatcher = () => {
  const { refetchNodeSummaries, workflowsManager } =
    projectRoute.useLoaderData();
  const runningWorkflowsCollection = workflowsManager.getRunningCollection();
  const {
    data: runningWorkflows = [],
    isError,
    isLoading,
  } = useLiveQuery(runningWorkflowsCollection);
  const summaryRefetchTimeoutRef = useRef<number | null>(null);

  // eslint-disable-next-line no-restricted-syntax -- owns and clears the route-scoped delayed summary refetch timer.
  useEffect(() => {
    return () => {
      if (summaryRefetchTimeoutRef.current === null) {
        return;
      }

      window.clearTimeout(summaryRefetchTimeoutRef.current);
      summaryRefetchTimeoutRef.current = null;
    };
  }, []);

  // eslint-disable-next-line no-restricted-syntax -- the reconciliation effect needs a stable delayed refetch scheduler with owned timeout state.
  const scheduleNodeSummaryRefetch = useCallback(() => {
    if (!canUseBrowserPolling()) {
      return;
    }

    if (summaryRefetchTimeoutRef.current !== null) {
      return;
    }

    summaryRefetchTimeoutRef.current = window.setTimeout(() => {
      summaryRefetchTimeoutRef.current = null;
      void Promise.resolve(refetchNodeSummaries()).catch(() => undefined);
    }, WORKFLOW_COMPLETION_SUMMARY_REFETCH_DELAY_MS);
  }, [refetchNodeSummaries]);

  // eslint-disable-next-line no-restricted-syntax -- compares live Temporal running-workflow snapshots with retained active workflow IDs to trigger background summary freshness.
  useEffect(() => {
    if (isLoading || isError) {
      return;
    }

    const shouldRefetchNodeSummaries =
      workflowsManager.reconcileRunningWorkflows(runningWorkflows);

    if (shouldRefetchNodeSummaries) {
      scheduleNodeSummaryRefetch();
    }
  }, [
    isError,
    isLoading,
    runningWorkflows,
    scheduleNodeSummaryRefetch,
    workflowsManager,
  ]);

  return null;
};
