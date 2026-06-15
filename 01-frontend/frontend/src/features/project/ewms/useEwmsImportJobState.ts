import { getWorkflowTemporalWorkflowsWorkflowIdGet } from '@/api-clients/temporal-jobs-module';
import type {
  GetWorkflowResponse,
  WorkflowsBase,
} from '@/api-clients/temporal-jobs-module/types.gen';
import { WORKFLOW_TYPE_FILE_PROCESSING } from '@/features/workflow-runtime/workflow-status/useRunningWorkflow';
import { useWorkflow } from '@/features/workflow-runtime/workflow-status/useWorkflow';
import { useQuery } from '@tanstack/react-query';
import {
  getLatestRunningEwmsWorkflow,
  getRunningEwmsWorkflowCandidates,
  isRunningEwmsWorkflowStatus,
} from './ewmsWorkflowStatus';

const EWMS_WORKFLOW_DETAIL_REFETCH_INTERVAL_MS = 10_000;

const toWorkflowFromDetail = (detail: GetWorkflowResponse): WorkflowsBase => ({
  ...detail,
  run_id: detail.workflow_id,
});

const toWorkflowFromCandidate = (
  candidate: ReturnType<typeof getRunningEwmsWorkflowCandidates>[number],
): WorkflowsBase => ({
  run_id: candidate.workflow_id,
  workflow_id: candidate.workflow_id,
  workflow_start_time: candidate.workflow_start_time,
  workflow_type: candidate.workflow_type,
  status: candidate.status as WorkflowsBase['status'],
});

const loadEwmsWorkflowDetails = async (
  candidates: ReturnType<typeof getRunningEwmsWorkflowCandidates>,
) => {
  const details = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const { data } = await getWorkflowTemporalWorkflowsWorkflowIdGet({
          path: {
            workflow_id: candidate.workflow_id,
          },
          throwOnError: true,
        });

        return toWorkflowFromDetail(data);
      } catch {
        return toWorkflowFromCandidate(candidate);
      }
    }),
  );

  return details;
};

export const useEwmsImportJobState = (projectId: string) => {
  const fileProcessingWorkflowState = useWorkflow({
    includeSubWorkflows: true,
    matchIdsInWorkflowId: [projectId],
    workflowType: WORKFLOW_TYPE_FILE_PROCESSING,
  });
  const runningCandidateWorkflowIds = getRunningEwmsWorkflowCandidates(
    fileProcessingWorkflowState.workflows,
  );
  const runningCandidateIds = runningCandidateWorkflowIds.map(
    (workflow) => workflow.workflow_id,
  );
  const { data: ewmsWorkflowDetails = [], isError: isEwmsDetailsError } =
    useQuery({
      queryKey: ['ewms-running-workflow-details', runningCandidateIds],
      queryFn: () => loadEwmsWorkflowDetails(runningCandidateWorkflowIds),
      enabled: runningCandidateIds.length > 0,
      refetchInterval: EWMS_WORKFLOW_DETAIL_REFETCH_INTERVAL_MS,
    });
  const runningEwmsWorkflows = ewmsWorkflowDetails.filter((workflow) =>
    isRunningEwmsWorkflowStatus(workflow.status),
  );
  const latestRunningWorkflow =
    getLatestRunningEwmsWorkflow(runningEwmsWorkflows);
  const isEwmsWorkflowRunning = runningEwmsWorkflows.length > 0;
  const isFileProcessingWorkflowRunning = fileProcessingWorkflowState.isRunning;

  return {
    isEwmsFileImportWorkflowRunning:
      isEwmsWorkflowRunning || isFileProcessingWorkflowRunning,
    isEwmsWorkflowRunning,
    isError: fileProcessingWorkflowState.isError || isEwmsDetailsError,
    isFileProcessingWorkflowRunning,
    isLoading:
      fileProcessingWorkflowState.isLoading ||
      (runningCandidateIds.length > 0 &&
        ewmsWorkflowDetails.length === 0 &&
        !isEwmsDetailsError),
    latestRunningWorkflow,
  };
};

export type EwmsImportJobState = ReturnType<typeof useEwmsImportJobState>;
