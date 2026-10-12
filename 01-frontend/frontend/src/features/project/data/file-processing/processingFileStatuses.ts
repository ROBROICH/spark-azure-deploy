import type {
  WorkflowStatusEnum,
  ZipFileResponse,
} from '@/api-clients/backend';

// `REQUIRES_APPROVAL` is included so the project-level processing banner (used
// by both FVP and SingleProject) stays visible while the zip workflow waits
// for the user's approval decision. The upload-completion polling hook uses
// its own narrower terminal-status check (`COMPLETED` or `REQUIRES_APPROVAL`)
// to decide when to advance the dialog.
export const ACTIVE_WORKFLOW_STATUSES: ReadonlySet<WorkflowStatusEnum> =
  new Set<WorkflowStatusEnum>([
    'PENDING',
    'RUNNING',
    'CONTINUED_AS_NEW',
    'REQUIRES_APPROVAL',
  ]);

export const FAILED_WORKFLOW_STATUSES: ReadonlySet<WorkflowStatusEnum> =
  new Set<WorkflowStatusEnum>([
    'FAILED',
    'CANCELED',
    'TERMINATED',
    'TIMED_OUT',
  ]);

export const isActiveWorkflowStatus = (
  status: WorkflowStatusEnum | undefined,
): boolean => status !== undefined && ACTIVE_WORKFLOW_STATUSES.has(status);

export const isActiveZipApprovalStatus = (
  status: ZipFileResponse['approvalStatus'] | undefined,
): boolean => status === 'APPROVING';

export const isFailedWorkflowStatus = (
  status: WorkflowStatusEnum | undefined,
): boolean => status !== undefined && FAILED_WORKFLOW_STATUSES.has(status);
