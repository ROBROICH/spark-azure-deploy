import type {
  WorkflowStatusEnum,
  ZipApprovalStatus,
  ZipFileResponse,
} from '@/api-clients/dms-module';
import { experimentalRouteRemount } from '@/integrations/router/routeRemount';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type {
  UploadErrorDetails,
  UploadGlobalError,
  UploadPhase,
} from '../DocumentsUploadContext.types';
import { isApprovalInitializingZip } from '../uploadWorkflow.helpers';

type RunningWorkflowsRefetcher = {
  refetchRunning: () => Promise<unknown>;
};

export type UseApprovalInitializationBridgeParams = {
  canMutateProject: boolean;
  processingFiles: ZipFileResponse[];
  phase: UploadPhase;
  zipFileId: string | null;
  projectId: string | null;
  verfahrenId: string;
  workflowsManager: RunningWorkflowsRefetcher;
  terminalStatus: WorkflowStatusEnum | undefined;
  terminalApprovalStatus: ZipApprovalStatus | null | undefined;
  setPhase: (phase: UploadPhase) => void;
  setProjectId: (id: string | null) => void;
  setZipFileId: (id: string | null) => void;
  setMinimized: (minimized: boolean) => void;
  setGlobalError: (error: UploadGlobalError | null) => void;
  setUploadErrorDetails: (details: UploadErrorDetails | null) => void;
  resetFiles: () => void;
};

type CompletionInvalidationParams = {
  phase: UploadPhase;
  terminalStatus: WorkflowStatusEnum | undefined;
  terminalApprovalStatus: ZipApprovalStatus | null | undefined;
  zipFileId: string | null;
  projectId: string | null;
  workflowsManager: RunningWorkflowsRefetcher;
};

const hasCommittedProjectVersion = (
  approvalStatus: ZipApprovalStatus | null | undefined,
) =>
  approvalStatus === null ||
  approvalStatus === undefined ||
  approvalStatus === 'APPROVED';

const refetchRunningWorkflowsBestEffort = (
  workflowsManager: RunningWorkflowsRefetcher,
) => {
  try {
    void workflowsManager.refetchRunning().catch(() => undefined);
  } catch {
    return;
  }
};

const refreshProjectVersionState = async (args: {
  projectId: string;
  queryClient: QueryClient;
  workflowsManager: RunningWorkflowsRefetcher;
}) => {
  const { projectId, queryClient, workflowsManager } = args;

  refetchRunningWorkflowsBestEffort(workflowsManager);

  await Promise.allSettled([
    queryClient.invalidateQueries({
      queryKey: ['files', projectId],
    }),
    queryClient.invalidateQueries({
      queryKey: ['processing-files', projectId],
    }),
    queryClient.invalidateQueries({ queryKey: ['projects'] }),
  ]);

  await experimentalRouteRemount(projectId);
};

const useCompletedWorkflowInvalidation = (
  params: CompletionInvalidationParams,
) => {
  const queryClient = useQueryClient();
  const lastCompletedZipRef = useRef<string | null>(null);

  // eslint-disable-next-line no-restricted-syntax -- no query-layer hook exposes a per-status transition callback; the effect is the only way to invalidate `['files']` and `['projects']` once polling first observes the workflow landing in `COMPLETED`.
  useEffect(() => {
    if (
      params.phase === 'approval-initializing' ||
      params.terminalStatus !== 'COMPLETED' ||
      !hasCommittedProjectVersion(params.terminalApprovalStatus) ||
      !params.zipFileId ||
      !params.projectId ||
      lastCompletedZipRef.current === params.zipFileId
    ) {
      return;
    }
    lastCompletedZipRef.current = params.zipFileId;
    void refreshProjectVersionState({
      projectId: params.projectId,
      queryClient,
      workflowsManager: params.workflowsManager,
    }).catch(() => undefined);
  }, [
    params.phase,
    params.terminalStatus,
    params.terminalApprovalStatus,
    params.zipFileId,
    params.projectId,
    params.workflowsManager,
    queryClient,
  ]);
};

type ResumeApprovalInitializingParams = Pick<
  UseApprovalInitializationBridgeParams,
  | 'canMutateProject'
  | 'phase'
  | 'verfahrenId'
  | 'setPhase'
  | 'setProjectId'
  | 'setZipFileId'
  | 'setMinimized'
  | 'setGlobalError'
  | 'setUploadErrorDetails'
  | 'resetFiles'
> & {
  approvalInitializingWorkflow: ZipFileResponse | undefined;
};

const useResumeApprovalInitializing = (
  params: ResumeApprovalInitializingParams,
) => {
  const {
    approvalInitializingWorkflow,
    canMutateProject,
    phase,
    resetFiles,
    setGlobalError,
    setMinimized,
    setPhase,
    setProjectId,
    setUploadErrorDetails,
    setZipFileId,
    verfahrenId,
  } = params;
  const shouldResumeApprovalInitializing =
    canMutateProject &&
    phase !== 'approval-initializing' &&
    (phase === 'idle' ||
      phase === 'selecting' ||
      phase === 'uploading' ||
      phase === 'diff' ||
      phase === 'ai-processes');

  // eslint-disable-next-line no-restricted-syntax -- the shared ZIP polling query is the backend source of truth for async version creation; bridge `APPROVING` into the parent-owned modal phase so users see that the new version is still being initialized.
  useEffect(() => {
    if (!shouldResumeApprovalInitializing || !approvalInitializingWorkflow) {
      return;
    }
    setPhase('approval-initializing');
    setProjectId(verfahrenId);
    setZipFileId(approvalInitializingWorkflow.id);
    setMinimized(false);
    setGlobalError(null);
    setUploadErrorDetails(null);
    resetFiles();
  }, [
    approvalInitializingWorkflow,
    resetFiles,
    setGlobalError,
    setMinimized,
    setPhase,
    setProjectId,
    setUploadErrorDetails,
    setZipFileId,
    shouldResumeApprovalInitializing,
    verfahrenId,
  ]);
};

type FinishApprovalInitializationParams = Pick<
  UseApprovalInitializationBridgeParams,
  | 'phase'
  | 'projectId'
  | 'setPhase'
  | 'setProjectId'
  | 'setZipFileId'
  | 'setMinimized'
  | 'setGlobalError'
  | 'setUploadErrorDetails'
  | 'resetFiles'
> & {
  activeZipFile: ZipFileResponse | null;
  workflowsManager: RunningWorkflowsRefetcher;
};

/**
 * Closes the approval-initializing dialog and remounts the route after polling
 * observes the tracked ZIP leave the `APPROVING` state.
 *
 * @param params Approval-initializing phase state, setters, and the current polled ZIP.
 */
const useFinishApprovalInitialization = (
  params: FinishApprovalInitializationParams,
) => {
  const {
    activeZipFile,
    phase,
    projectId,
    resetFiles,
    setGlobalError,
    setMinimized,
    setPhase,
    setProjectId,
    setUploadErrorDetails,
    setZipFileId,
    workflowsManager,
  } = params;
  const queryClient = useQueryClient();
  const hasObservedApprovingRef = useRef(false);

  const approvalStatus = activeZipFile?.approvalStatus;
  const isApproving =
    phase === 'approval-initializing' && approvalStatus === 'APPROVING';

  // eslint-disable-next-line no-restricted-syntax -- approval/version creation completes asynchronously after the user decision; keep the previous poll's `APPROVING` observation so the next poll can close the dialog and remount the route when the ZIP leaves that state.
  useEffect(() => {
    if (isApproving) {
      hasObservedApprovingRef.current = true;
    }
    if (phase !== 'approval-initializing') {
      hasObservedApprovingRef.current = false;
    }
  }, [isApproving, phase]);

  // eslint-disable-next-line no-restricted-syntax -- approval/version creation completes asynchronously after the user decision; when polling shows the ZIP has left `APPROVING`, close the transient dialog and remount the route so the page reloads project/version data.
  useEffect(() => {
    if (
      phase !== 'approval-initializing' ||
      !hasObservedApprovingRef.current ||
      approvalStatus === 'APPROVING' ||
      !projectId
    ) {
      return;
    }
    setPhase('idle');
    setProjectId(null);
    setZipFileId(null);
    setMinimized(false);
    setGlobalError(null);
    setUploadErrorDetails(null);
    resetFiles();
    void refreshProjectVersionState({
      projectId,
      queryClient,
      workflowsManager,
    }).catch(() => undefined);
  }, [
    approvalStatus,
    phase,
    projectId,
    queryClient,
    resetFiles,
    setGlobalError,
    setMinimized,
    setPhase,
    setProjectId,
    setUploadErrorDetails,
    setZipFileId,
    workflowsManager,
  ]);
};

/**
 * Bridges polled ZIP approval status into the upload dialog phase machine and
 * refreshes document caches when async version creation finishes.
 *
 * @param params Upload workflow state, setters, and polled terminal statuses.
 */
export const useApprovalInitializationBridge = (
  params: UseApprovalInitializationBridgeParams,
) => {
  const approvalInitializingWorkflow = params.processingFiles.find(
    isApprovalInitializingZip,
  );
  const activeZipFile =
    params.processingFiles.find((file) => file.id === params.zipFileId) ?? null;

  useCompletedWorkflowInvalidation({
    phase: params.phase,
    terminalStatus: params.terminalStatus,
    terminalApprovalStatus: params.terminalApprovalStatus,
    zipFileId: params.zipFileId,
    projectId: params.projectId,
    workflowsManager: params.workflowsManager,
  });
  useResumeApprovalInitializing({
    canMutateProject: params.canMutateProject,
    phase: params.phase,
    verfahrenId: params.verfahrenId,
    approvalInitializingWorkflow,
    setPhase: params.setPhase,
    setProjectId: params.setProjectId,
    setZipFileId: params.setZipFileId,
    setMinimized: params.setMinimized,
    setGlobalError: params.setGlobalError,
    setUploadErrorDetails: params.setUploadErrorDetails,
    resetFiles: params.resetFiles,
  });
  useFinishApprovalInitialization({
    phase: params.phase,
    projectId: params.projectId,
    setPhase: params.setPhase,
    setProjectId: params.setProjectId,
    setZipFileId: params.setZipFileId,
    setMinimized: params.setMinimized,
    setGlobalError: params.setGlobalError,
    setUploadErrorDetails: params.setUploadErrorDetails,
    resetFiles: params.resetFiles,
    activeZipFile,
    workflowsManager: params.workflowsManager,
  });
};
