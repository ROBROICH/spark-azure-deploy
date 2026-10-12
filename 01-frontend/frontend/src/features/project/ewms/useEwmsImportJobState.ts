import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import { WORKFLOW_TYPE_FILE_PROCESSING } from '@/features/workflow-runtime/workflow-status/useRunningWorkflow';
import { useSubWorkflow } from '@/features/workflow-runtime/workflow-status/useSubWorkflow';
import { useWorkflow } from '@/features/workflow-runtime/workflow-status/useWorkflow';
import {
  RUNNING_WORKFLOW_STATUSES,
  WORKFLOW_TYPE_EWMS,
} from '@/features/workflow-runtime/workflow-status/workflowStatus.helpers';

export type EwmsImportJobState = {
  isEwmsFileImportWorkflowRunning: boolean;
  isEwmsWorkflowRunning: boolean;
  isError: boolean;
  isFileProcessingWorkflowRunning: boolean;
  isLoading: boolean;
  latestRunningWorkflow: WorkflowsBase | undefined;
};

export const useEwmsImportJobState = (
  projectId: string,
): EwmsImportJobState => {
  const fileProcessingWorkflowState = useWorkflow({
    matchIdsInWorkflowId: [projectId],
    workflowType: WORKFLOW_TYPE_FILE_PROCESSING,
  });
  const ewms = useSubWorkflow({
    workflowState: fileProcessingWorkflowState,
    subWorkflowType: WORKFLOW_TYPE_EWMS,
  });
  return {
    isEwmsFileImportWorkflowRunning:
      ewms.isRunning || fileProcessingWorkflowState.isRunning,
    isEwmsWorkflowRunning: ewms.isRunning,
    isError: ewms.isError,
    isFileProcessingWorkflowRunning: fileProcessingWorkflowState.isRunning,
    isLoading: ewms.isStatusLoading,
    latestRunningWorkflow: ewms.subWorkflows.find((workflow) =>
      RUNNING_WORKFLOW_STATUSES.has(workflow.status ?? ''),
    ),
  };
};
