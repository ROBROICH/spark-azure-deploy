import { v1TemporalJobsListTemporalWorkflowsByType } from '@/api-clients/backend';
import { useQueries } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import type {
  WorkflowFailureCode,
  WorkflowState,
  WorkflowTypeName,
} from './workflowStatus.types';
import {
  getRunFailure,
  RUNNING_WORKFLOW_STATUSES,
} from './workflowStatus.helpers';

const route = getRouteApi('/verfahren/$verfahrenId');
// "all" proves that a stage ran, even after it finished while the parent keeps
// working; "Running" finds a running stage that is not the first row of "all".
const executionStatuses = ['all', 'Running'] as const;

// Each child summary carries its own failure. `subWorkflows` is sorted newest
// first.
const getSubWorkflowOutcome = (
  subWorkflows: ReadonlyArray<WorkflowsBase>,
): {
  failureCode: WorkflowFailureCode | null;
  hasCompletedRun: boolean;
  isRunning: boolean;
} => {
  const latestSubWorkflow = subWorkflows.at(0);

  return {
    failureCode: getRunFailure(latestSubWorkflow)?.errorCode ?? null,
    hasCompletedRun: latestSubWorkflow?.status === 'completed',
    isRunning: subWorkflows.some((workflow) =>
      RUNNING_WORKFLOW_STATUSES.has(workflow.status ?? ''),
    ),
  };
};

/**
 * Descendant status belongs to one exact root run, not a truncated project history.
 * @param args - Parent workflow state and the descendant workflow types needed by the feature.
 * @returns Whether a stage is running or still pending, retained running data on read errors, and separate read/busy state.
 */
export const useSubWorkflow = (args: {
  subWorkflowType: WorkflowTypeName | WorkflowTypeName[];
  workflowState: WorkflowState;
}) => {
  const { subWorkflowType, workflowState } = args;
  const { verfahrenId: projectId } = route.useParams();
  const { projectVersion } = route.useLoaderData();
  const root = workflowState.latestWorkflow;
  const workflowTypes = [subWorkflowType].flat();
  const reads = useQueries({
    queries:
      root === undefined
        ? []
        : workflowTypes.flatMap((workflowType) =>
            executionStatuses.map((executionStatus) => ({
              queryKey: [
                'project-temporal-workflows',
                projectId,
                projectVersion,
                'descendant-status',
                root.workflowId,
                root.runId,
                workflowType,
                executionStatus,
              ],
              queryFn: async () => {
                const { data } =
                  await v1TemporalJobsListTemporalWorkflowsByType({
                    path: { projectId },
                    query: {
                      projectVersion,
                      workflowType,
                      executionStatus,
                      rootWorkflowId: root.workflowId,
                      rootRunId: root.runId,
                      pageSize: 1,
                    },
                    throwOnError: true,
                  });
                return data.workflows;
              },
              refetchInterval: 30_000,
            })),
          ),
  });
  const subWorkflows = [
    ...new Map(
      reads
        .flatMap((read) => read.data ?? [])
        .map((workflow) => [
          `${workflow.workflowId}:${workflow.runId}`,
          workflow,
        ]),
    ).values(),
  ].sort(
    (left, right) =>
      Date.parse(right.workflowStartTime ?? '') -
      Date.parse(left.workflowStartTime ?? ''),
  );
  const outcome = getSubWorkflowOutcome(subWorkflows);
  const isStatusLoading =
    workflowState.isLoading || reads.some((read) => read.isPending);
  return {
    subWorkflows,
    ...outcome,
    isLoading:
      isStatusLoading ||
      outcome.isRunning ||
      (subWorkflows.length === 0 && workflowState.isRunning),
    isStatusLoading,
    isError: workflowState.isError || reads.some((read) => read.isError),
  };
};
