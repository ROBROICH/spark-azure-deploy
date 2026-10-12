import { useLiveQuery } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect, useSyncExternalStore } from 'react';
import {
  getMatchingWorkflows,
  getWorkflowCollectionRequest,
  normalizeWorkflowValue,
  RUNNING_WORKFLOW_STATUSES,
} from './workflowStatus.helpers';
import type { WorkflowTypeName } from './workflowStatus.types';

export {
  WORKFLOW_TYPE_BEWERTUNG,
  WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
  WORKFLOW_TYPE_FILE_PROCESSING,
  WORKFLOW_TYPE_FVP,
  WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING,
  WORKFLOW_TYPE_LLM_MATCHING,
  WORKFLOW_TYPE_RISIKOHINWEISE,
  WORKFLOW_TYPE_SUZ_NORM,
} from './workflowStatus.helpers';

type UseRunningWorkflowOptions = {
  matchIdsInWorkflowId?: string[];
  refetchNodeSummariesOnSuccess?: boolean;
  workflowType?: WorkflowTypeName | WorkflowTypeName[];
};

const route = getRouteApi('/verfahren/$verfahrenId');

/**
 * Reads only the current Temporal running-workflows collection and answers
 * whether a matching workflow is active for the current project/version.
 */
export const useRunningWorkflow = (options: UseRunningWorkflowOptions = {}) => {
  const { workflowsManager } = route.useLoaderData();
  const { matchIdsInWorkflowId, refetchNodeSummariesOnSuccess, workflowType } =
    options;
  const runningWorkflowsCollection = workflowsManager.getCollection({
    ...getWorkflowCollectionRequest({ workflowType, matchIdsInWorkflowId }),
    executionStatus: 'Running',
  });
  const {
    data: runningWorkflows = [],
    isError,
    isLoading,
  } = useLiveQuery(runningWorkflowsCollection);
  const observedStartedWorkflows = useSyncExternalStore(
    workflowsManager.subscribeRunningWorkflowObservations,
    workflowsManager.getRunningWorkflowObservations,
    workflowsManager.getRunningWorkflowObservations,
  );
  const matchingRunningWorkflows = getMatchingWorkflows({
    workflows: runningWorkflows,
    workflowType,
    matchIdsInWorkflowId,
  }).filter((workflow) =>
    RUNNING_WORKFLOW_STATUSES.has(normalizeWorkflowValue(workflow.status)),
  );
  const matchingObservedStartedWorkflows = getMatchingWorkflows({
    workflows: observedStartedWorkflows,
    workflowType,
    matchIdsInWorkflowId,
  });
  const shouldRefetchNodeSummariesOnSuccess =
    refetchNodeSummariesOnSuccess ?? true;
  const isRunning =
    matchingRunningWorkflows.length > 0 ||
    matchingObservedStartedWorkflows.length > 0;
  const latestRunningWorkflow =
    matchingRunningWorkflows.at(0) ?? matchingObservedStartedWorkflows.at(0);
  const runningWorkflowIds = [
    ...new Set(
      [...matchingRunningWorkflows, ...matchingObservedStartedWorkflows].map(
        (workflow) => workflow.workflowId,
      ),
    ),
  ].sort();

  // eslint-disable-next-line no-restricted-syntax -- registers matching running workflows so project-level completion observation survives feature unmounts.
  useEffect(() => {
    for (const workflow of matchingRunningWorkflows) {
      workflowsManager.observeRunningWorkflow(workflow.workflowId, {
        refetchNodeSummariesOnSuccess: shouldRefetchNodeSummariesOnSuccess,
        workflowType: workflow.workflowType,
      });
    }
  }, [
    matchingRunningWorkflows,
    shouldRefetchNodeSummariesOnSuccess,
    workflowsManager,
  ]);

  return {
    isError,
    isLoading,
    isRunning,
    latestRunningWorkflow,
    runningWorkflowIds,
    observeStarted: (workflowId: string) =>
      workflowsManager.observeStartedWorkflow(workflowId, {
        refetchNodeSummariesOnSuccess: shouldRefetchNodeSummariesOnSuccess,
        workflowType,
      }),
  };
};
