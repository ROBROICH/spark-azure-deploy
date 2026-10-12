import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import { useLiveQuery } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  FAILED_WORKFLOW_STATUSES,
  RUNNING_WORKFLOW_STATUSES,
  getLatestWorkflowsByType,
  getMatchingWorkflows,
  getRunFailure,
  getWorkflowCollectionRequest,
  getWorkflowRunKey,
  normalizeWorkflowValue,
} from './workflowStatus.helpers';
import { useRunningWorkflow } from './useRunningWorkflow';
import type { WorkflowState, WorkflowTypeName } from './workflowStatus.types';

export type { WorkflowTypeName } from './workflowStatus.types';

type WorkflowSuccessCallback = (
  workflow: WorkflowsBase,
) => Promise<void> | void;

type UseWorkflowOptions = {
  workflowType?: WorkflowTypeName | WorkflowTypeName[];
  matchIdsInWorkflowId?: string[];
  onLatestWorkflowSucceeded?: WorkflowSuccessCallback;
  refetchNodeSummariesOnSuccess?: boolean;
};

const route = getRouteApi('/verfahren/$verfahrenId');
const useLatestWorkflowSuccessEffect = (args: {
  isDone: boolean;
  isLatestRunPending: boolean;
  latestWorkflow: WorkflowsBase | undefined;
  onLatestWorkflowSucceeded: WorkflowSuccessCallback | undefined;
  workflowRunKey: string | null;
}) => {
  const {
    isDone,
    isLatestRunPending,
    latestWorkflow,
    onLatestWorkflowSucceeded,
    workflowRunKey,
  } = args;
  const completion = useMutation({
    mutationFn:
      onLatestWorkflowSucceeded === undefined
        ? undefined
        : async (workflow: WorkflowsBase) =>
            onLatestWorkflowSucceeded(workflow),
  });
  const { mutate: notifyCompletion } = completion;
  const previousWorkflowRef = useRef<{
    isPending: boolean;
    workflowRunKey: string | null;
  }>({
    isPending: false,
    workflowRunKey: null,
  });

  // eslint-disable-next-line no-restricted-syntax -- this effect bridges live workflow refreshes into a one-time callback when the tracked latest run succeeds
  useEffect(() => {
    const previousWorkflow = previousWorkflowRef.current;
    const isSuccessTransition =
      previousWorkflow.workflowRunKey === workflowRunKey &&
      previousWorkflow.isPending &&
      !isLatestRunPending &&
      isDone &&
      latestWorkflow !== undefined;

    if (isSuccessTransition && onLatestWorkflowSucceeded !== undefined) {
      notifyCompletion(latestWorkflow);
    }

    previousWorkflowRef.current = {
      isPending: isLatestRunPending,
      workflowRunKey,
    };
  }, [
    notifyCompletion,
    onLatestWorkflowSucceeded,
    isDone,
    isLatestRunPending,
    latestWorkflow,
    workflowRunKey,
  ]);

  return completion;
};

export const useWorkflowHistoryRefetch = (args: {
  isRunning: boolean;
  refresh: () => Promise<unknown> | unknown;
  /** Changes when one matching run starts or settles while another keeps running. */
  runningKey?: string;
}) => {
  const { isRunning, refresh, runningKey } = args;
  const previousRunningRef = useRef(isRunning);
  const { mutate: refreshHistory } = useMutation({
    mutationFn: () => Promise.resolve(refresh()),
  });

  // eslint-disable-next-line no-restricted-syntax -- refreshes historical workflow data when the running-workflow read model says a matching run starts or settles.
  useEffect(() => {
    const wasRunning = previousRunningRef.current;
    previousRunningRef.current = isRunning;

    if (isRunning || wasRunning) {
      refreshHistory();
    }
  }, [isRunning, refreshHistory, runningKey]);
};

/**
 * Reads project workflows from the verfahren route collection and derives
 * reusable workflow-state flags for type-scoped UI decisions.
 */
export const useWorkflow = (
  options: UseWorkflowOptions = {},
): WorkflowState => {
  const { workflowsManager } = route.useLoaderData();
  const workflowCollectionRequest = getWorkflowCollectionRequest({
    matchIdsInWorkflowId: options.matchIdsInWorkflowId,
    workflowType: options.workflowType,
  });
  const workflowsCollection = workflowsManager.getCollection(
    workflowCollectionRequest,
  );
  const {
    data: allWorkflows = [],
    isLoading,
    isError,
  } = useLiveQuery(workflowsCollection);
  const { isRunning: isRunningWorkflow } = useRunningWorkflow({
    workflowType: options.workflowType,
    matchIdsInWorkflowId: options.matchIdsInWorkflowId,
    refetchNodeSummariesOnSuccess: options.refetchNodeSummariesOnSuccess,
  });
  useWorkflowHistoryRefetch({
    isRunning: isRunningWorkflow,
    refresh: () => workflowsManager.refetch(workflowCollectionRequest),
  });
  const workflows = getMatchingWorkflows({
    workflows: allWorkflows,
    workflowType: options.workflowType,
    matchIdsInWorkflowId: options.matchIdsInWorkflowId,
  });
  const latestWorkflow = workflows.at(0);
  const latestWorkflowStatus = normalizeWorkflowValue(latestWorkflow?.status);
  const isLatestRunPending =
    latestWorkflow !== undefined &&
    RUNNING_WORKFLOW_STATUSES.has(latestWorkflowStatus);
  const isRunning = isRunningWorkflow;
  const isDone = latestWorkflowStatus === 'completed';
  const isFailed = FAILED_WORKFLOW_STATUSES.has(latestWorkflowStatus);
  const hasSuccessfulRun = workflows.some(
    (workflow) => normalizeWorkflowValue(workflow.status) === 'completed',
  );
  const workflowRunKey = getWorkflowRunKey(latestWorkflow);

  const completion = useLatestWorkflowSuccessEffect({
    isDone,
    isLatestRunPending,
    latestWorkflow,
    onLatestWorkflowSucceeded: options.onLatestWorkflowSucceeded,
    workflowRunKey,
  });

  return {
    workflows,
    latestWorkflow,
    latestWorkflowsByType: getLatestWorkflowsByType(workflows),
    hasAnyRun: workflows.length > 0,
    hasSuccessfulRun,
    isRunning,
    // An active run supersedes the failure of the previous one, so the hook
    // reports no failure while a matching run is running.
    latestFailure: isRunning ? null : getRunFailure(latestWorkflow),
    isLastRunError: isFailed,
    isLastRunSuccessful: isDone,
    isDone,
    isFailed,
    isLoading: isLoading || completion.isPending,
    isError: isError || completion.isError,
  };
};
