import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useProcessingFilesQuery } from '@/features/project/data/file-processing/useProcessingFilesQuery';
import { useProjectRouteVersion } from '@/features/project/versioning/projectVersioning';
import * as Sentry from '@sentry/react';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useEffect, useReducer } from 'react';
import {
  documentsUploadWorkflowReducer,
  initialWorkflowState,
} from './DocumentsUploadContext.reducer';
import type {
  UploadErrorDetails,
  UploadGlobalError,
  UploadPhase,
} from './DocumentsUploadContext.types';
import { useApprovalActions } from './dialog-logic/useApprovalActions';
import { useApprovalInitializationBridge } from './dialog-logic/useApprovalInitializationBridge';
import { useDialogCloseAction } from './dialog-logic/useDialogCloseAction';
import { useUploadCompletionPolling } from './dialog-logic/useUploadCompletionPolling';
import { useUploadFileSelection } from './dialog-logic/useUploadFileSelection';
import { useZipUpload } from './dialog-logic/useZipUpload';
import {
  lookupOpenWorkflow,
  resolveOpenWorkflow,
  runStartUpload,
  type OpenWorkflowPreflight,
} from './uploadWorkflow.helpers';

const projectRoute = getRouteApi('/verfahren/$verfahrenId');

/**
 * Owns app-level state for the documents update workflow: phase machine, zip-file id, minimize flag, and error state. File selection and upload polling are delegated to dedicated hooks.
 *
 * @returns Context value consumed by dialog steps, the floating toast, and the project trigger.
 */
// eslint-disable-next-line custom-size/limit-logic-function-lines -- the workflow state, polling bridge, and action callbacks are intentionally co-located in one logic hook (see `structure-react-contexts-around-a-logic-hook`); splitting them back into sub-hooks regresses the field-by-field unpack pattern.
export const useDocumentsUploadContextLogic = () => {
  const { verfahrenId } = projectRoute.useParams();
  const { workflowsManager } = projectRoute.useLoaderData();
  const [
    { phase, projectId, zipFileId, minimized, globalError, uploadErrorDetails },
    dispatchWorkflow,
  ] = useReducer(documentsUploadWorkflowReducer, initialWorkflowState);

  const setPhase = useCallback(
    (nextPhase: UploadPhase) =>
      dispatchWorkflow({ type: 'setPhase', phase: nextPhase }),
    [],
  );
  const setProjectId = useCallback(
    (nextProjectId: string | null) =>
      dispatchWorkflow({ type: 'setProjectId', projectId: nextProjectId }),
    [],
  );
  const setZipFileId = useCallback(
    (nextZipFileId: string | null) =>
      dispatchWorkflow({ type: 'setZipFileId', zipFileId: nextZipFileId }),
    [],
  );
  const setMinimized = useCallback(
    (nextMinimized: boolean) =>
      dispatchWorkflow({ type: 'setMinimized', minimized: nextMinimized }),
    [],
  );
  const setGlobalError = useCallback(
    (nextGlobalError: UploadGlobalError | null) =>
      dispatchWorkflow({
        type: 'setGlobalError',
        globalError: nextGlobalError,
      }),
    [],
  );
  const setUploadErrorDetails = useCallback(
    (nextUploadErrorDetails: UploadErrorDetails | null) =>
      dispatchWorkflow({
        type: 'setUploadErrorDetails',
        uploadErrorDetails: nextUploadErrorDetails,
      }),
    [],
  );

  // Permission gate for the upload workflow. The provider is mounted under
  // `/verfahren/$verfahrenId` so the project route params are available here.
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const projectVersion = useProjectRouteVersion();

  const {
    files,
    addFiles: addFilesInternal,
    removeFile,
    markFileAsUploadFailed,
    resetFiles,
  } = useUploadFileSelection();
  const { isUploading, uploadZip } = useZipUpload();
  const approvalActions = useApprovalActions();
  const { runCloseSideEffect } = useDialogCloseAction(approvalActions);
  const { data: processingFiles = [] } = useProcessingFilesQuery({
    projectId: verfahrenId,
    enabled: canMutateProject,
    pollWhileActive: true,
  });
  // Keep polling enabled through the post-approval `ai-processes` step so the
  // backend workflow's final `COMPLETED` transition is observed while the user
  // is still on the last modal. This drives the background invalidation effect
  // below so the documents table and version badge refresh behind the dialog.
  const {
    isProcessingComplete,
    isProcessingFailed,
    terminalStatus,
    terminalApprovalStatus,
    terminalWorkflowFailureCode,
  } = useUploadCompletionPolling({
    zipFileId,
    projectId,
    enabled:
      phase === 'uploading' ||
      phase === 'approval-initializing' ||
      phase === 'ai-processes',
  });

  // Render-derived phase: while uploading, the polled completion advances the
  // visible phase based on the backend's terminal workflow status. A first
  // upload is auto-approved by the backend and lands in `COMPLETED`, which the
  // UI surfaces as a success modal; subsequent uploads land in
  // `REQUIRES_APPROVAL` and route to the diff/decision step. Failures route
  // back to the selecting screen, where the derived global error below surfaces
  // the processing failure copy until the user retries or closes.
  const resolvePostUploadPhase = (): UploadPhase => {
    if (terminalApprovalStatus === 'APPROVING') {
      return 'approval-initializing';
    }
    if (terminalStatus === 'COMPLETED') {
      return 'upload-success';
    }
    return 'diff';
  };

  const isUploadingWithFailure = phase === 'uploading' && isProcessingFailed;

  const displayedPhase: UploadPhase = isUploadingWithFailure
    ? 'selecting'
    : phase === 'uploading' && isProcessingComplete
      ? resolvePostUploadPhase()
      : phase;

  // Derive the visible error from the same polling signal that drives the
  // visible phase, so a processing failure surfaces immediately without an
  // effect mirroring polling state into local state. The underlying
  // `globalError`/`uploadErrorDetails` state still owns pre-submit errors and
  // upload-pipeline failures that originate outside polling.
  const displayedGlobalError: UploadGlobalError | null = isUploadingWithFailure
    ? 'processing-failed'
    : globalError;
  const displayedUploadErrorDetails: UploadErrorDetails | null =
    isUploadingWithFailure
      ? {
          kind: 'processing-failed',
          workflowFailureCode: terminalWorkflowFailureCode,
        }
      : uploadErrorDetails;

  const reset = useCallback(
    (next: {
      phase: UploadPhase;
      projectId: string | null;
      zipFileId?: string | null;
    }) => {
      dispatchWorkflow({
        type: 'reset',
        phase: next.phase,
        projectId: next.projectId,
        zipFileId: next.zipFileId,
      });
    },
    [],
  );

  const pendingApprovalWorkflow = resolveOpenWorkflow(processingFiles);
  const shouldResumePendingApproval =
    canMutateProject &&
    pendingApprovalWorkflow?.phase === 'diff' &&
    (phase === 'idle' || phase === 'selecting' || phase === 'uploading');

  // eslint-disable-next-line no-restricted-syntax -- the shared ZIP polling query is the backend source of truth for pending approval workflows; bridge its first observable `REQUIRES_APPROVAL` result into the dialog state so users resume the diff instead of starting another upload.
  useEffect(() => {
    if (!shouldResumePendingApproval) {
      return;
    }
    dispatchWorkflow({
      type: 'resumePendingApproval',
      projectId: verfahrenId,
      zipFileId: pendingApprovalWorkflow.zipFileId,
    });
    resetFiles();
  }, [
    pendingApprovalWorkflow,
    resetFiles,
    shouldResumePendingApproval,
    verfahrenId,
  ]);

  useApprovalInitializationBridge({
    canMutateProject,
    processingFiles,
    phase,
    zipFileId,
    projectId,
    verfahrenId,
    workflowsManager,
    terminalStatus,
    terminalApprovalStatus,
    setPhase,
    setProjectId,
    setZipFileId,
    setMinimized,
    setGlobalError,
    setUploadErrorDetails,
    resetFiles,
  });

  // Awaits the pre-open `listZipFiles` lookup before mounting the dialog so
  // there is no intermediate loading modal. Callers (e.g., the trigger card)
  // show a loading state on their own affordance while this promise resolves.
  const openForProject = useCallback(
    async (id: string) => {
      // Fail closed when the current user lacks mutate rights on this project.
      // The trigger is hidden in SingleProjectDocumentsCard; this guard
      // protects against direct callers and race conditions during membership
      // changes.
      if (!canMutateProject) {
        Sentry.captureException(
          new Error('openForProject invoked without project mutate rights.'),
          {
            tags: {
              area: 'documents-update',
              flow: 'permission-denied',
            },
            extra: { projectId: id },
          },
        );
        return;
      }
      let preflight: OpenWorkflowPreflight | null = null;
      try {
        preflight = await lookupOpenWorkflow(id, projectVersion);
      } catch (error) {
        Sentry.captureException(error, {
          tags: { area: 'documents-update', flow: 'pre-open-check' },
          extra: { projectId: id },
        });
        // Fall back to the upload step rather than blocking the user; a stale
        // open workflow will still be caught by the 409 recovery in
        // `runStartUpload` when the user attempts an upload.
      }
      reset({
        phase: preflight?.phase ?? 'selecting',
        projectId: id,
        zipFileId: preflight?.zipFileId,
      });
      resetFiles();
    },
    [canMutateProject, projectVersion, reset, resetFiles],
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      setGlobalError(addFilesInternal(incoming));
      setUploadErrorDetails(null);
    },
    [addFilesInternal, setGlobalError, setUploadErrorDetails],
  );

  const startUpload = useCallback(async () => {
    await runStartUpload({
      projectId,
      projectVersion,
      canMutateProject,
      files,
      uploadZip,
      markFileAsUploadFailed,
      setPhase,
      setZipFileId,
      setGlobalError,
      setUploadErrorDetails,
    })();
  }, [
    projectId,
    projectVersion,
    canMutateProject,
    files,
    uploadZip,
    markFileAsUploadFailed,
    setGlobalError,
    setPhase,
    setUploadErrorDetails,
    setZipFileId,
  ]);

  const close = useCallback(() => {
    if (displayedPhase === 'uploading' && !zipFileId) {
      return;
    }
    void runCloseSideEffect({
      phase: displayedPhase,
      zipFileId,
      projectId,
    });
    reset({ phase: 'idle', projectId: null });
    resetFiles();
  }, [
    displayedPhase,
    zipFileId,
    projectId,
    runCloseSideEffect,
    reset,
    resetFiles,
  ]);

  // Reset without running the close side effect (cancel/reject). Used by flows
  // that have already issued the backend decision themselves (e.g., the
  // explicit reject button on the diff step) to avoid sending a second
  // decision request.
  const dismiss = useCallback(() => {
    reset({ phase: 'idle', projectId: null });
    resetFiles();
  }, [reset, resetFiles]);

  const minimize = useCallback(() => {
    if (displayedPhase === 'uploading') {
      setMinimized(true);
    }
  }, [displayedPhase, setMinimized]);

  const maximize = useCallback(() => setMinimized(false), [setMinimized]);

  const goToAiProcesses = useCallback(() => {
    setPhase('ai-processes');
  }, [setPhase]);

  return {
    phase: displayedPhase,
    projectId,
    files,
    zipFileId,
    minimized,
    isUploading,
    globalError: displayedGlobalError,
    uploadErrorDetails: displayedUploadErrorDetails,
    approvalActions,
    openForProject,
    addFiles,
    removeFile,
    startUpload,
    goToAiProcesses,
    minimize,
    maximize,
    close,
    dismiss,
  };
};
