import { isHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';
import { toast } from '@/features/ui/toast/Toast';
import * as Sentry from '@sentry/react';
import { useTranslation } from 'react-i18next';
import type { UploadPhase } from '../DocumentsUploadContext.types';
import type { ApprovalActions } from './useApprovalActions';
import { useInvalidateUploadCaches } from './useInvalidateUploadCaches';

type CloseActionParams = {
  phase: UploadPhase;
  zipFileId: string | null;
  projectId: string | null;
};

// Phases that follow a backend-side workflow whose terminal state may land
// after the upload-time invalidation. Refetching on close ensures the
// documents table and version badge reflect the final state without a
// manual page refresh.
const PHASES_REQUIRING_POST_CLOSE_REFETCH = new Set([
  'upload-success',
  'ai-processes',
  'approval-initializing',
  'diff',
]);

/**
 * Resolves the side effect that should run when the user closes the Unterlagen
 * dialog. Only the active upload phase fires an API call (cancel the in-flight
 * processing); diff/decision dismissal is treated as a local close because the
 * dedicated Reject button is the only path that submits a reject decision.
 *
 * The shared `ApprovalActions` instance must be passed in by the caller so the
 * dialog only mounts the underlying mutations once (no parallel mutation state
 * with `useConfirmDiffApproval`).
 *
 * @param approvalActions Shared approval-flow mutations mounted once by the dialog provider.
 * @returns runCloseSideEffect — fires the appropriate API call, surfaces a toast on failure, and resolves regardless of mutation outcome.
 */
export const useDialogCloseAction = (approvalActions: ApprovalActions) => {
  const { cancelUpload } = approvalActions;
  const { t } = useTranslation('Project');
  const { invalidateForProject } = useInvalidateUploadCaches();

  /**
   * Runs the appropriate side effect for the closing dialog phase. Cancels the
   * in-flight upload during the `uploading` phase; otherwise re-invalidates the
   * project caches for phases that follow a backend workflow whose terminal
   * state may land after the upload-time invalidation.
   *
   * @param params Closing phase, zip file id, and owning project id.
   * @returns A promise that resolves once the side effect (if any) settles.
   */
  const runCloseSideEffect = async (params: CloseActionParams) => {
    const { phase, zipFileId, projectId } = params;

    if (phase !== 'uploading') {
      // The upload-time invalidation in `useZipUpload` fires before the backend
      // workflow reaches its terminal state, so the documents table and version
      // badge can hold stale data after a successful upload, approval, or
      // post-approval AI processing. Re-invalidate on close so the user does not
      // need to refresh the page to see the new version.
      if (projectId && PHASES_REQUIRING_POST_CLOSE_REFETCH.has(phase)) {
        await invalidateForProject(projectId);
      }
      return;
    }

    if (!zipFileId) {
      return;
    }

    try {
      await cancelUpload.mutateAsync(zipFileId);
    } catch (error) {
      if (isHandledProjectVersionConflictError(error)) {
        return;
      }
      Sentry.captureException(error, {
        tags: {
          area: 'documents-update',
          flow: 'cancel',
          stage: 'close-side-effect',
        },
        extra: { zipFileId, projectId },
      });
      toast.error(t('Documents.updateDocuments.closeError'));
      return;
    }

    // Invalidation parity with the approve/reject paths so the documents card
    // and processing banner do not show stale state after a cancel.
    if (projectId) {
      await invalidateForProject(projectId);
    }
  };

  return { runCloseSideEffect };
};
