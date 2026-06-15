import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { isHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';
import { toast } from '@/features/ui/toast/Toast';
import * as Sentry from '@sentry/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApprovalActions } from './useApprovalActions';
import { useInvalidateUploadCaches } from './useInvalidateUploadCaches';

type RejectParams = {
  zipFileId: string | null;
  projectId: string | null;
  onRejected: () => void;
};

/**
 * Submits an explicit reject decision for a pending-approval ZIP upload,
 * invalidates project caches, and runs the post-reject transition. Surfaces
 * a toast and an error flag on failure.
 *
 * @param approvalActions Shared approval-flow mutations mounted once by the dialog provider.
 * @returns reject — runs the flow; isRejecting — pending flag; rejectError — true after a failed submission until the next attempt.
 */
export const useRejectDiffApproval = (approvalActions: ApprovalActions) => {
  const { submitDecision } = approvalActions;
  const { invalidateForProject } = useInvalidateUploadCaches();
  const { t } = useTranslation('Project');
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  // eslint-disable-next-line no-restricted-syntax -- reject error is transient feedback scoped to the diff dialog step.
  const [rejectError, setRejectError] = useState(false);

  /**
   * Submits the reject decision for a pending-approval ZIP, invalidates the
   * affected caches, and runs the post-reject transition. Fails closed when the
   * caller lacks project mutate rights.
   *
   * @param params Workflow IDs and the post-reject transition callback.
   * @returns A promise that resolves once the mutation and invalidation settle.
   */
  const reject = async (params: RejectParams) => {
    const { zipFileId, projectId, onRejected } = params;
    if (!zipFileId || !projectId) {
      return;
    }
    if (!canMutateProject) {
      Sentry.captureException(
        new Error(
          'useRejectDiffApproval.reject called without project mutate rights; remote write skipped.',
        ),
        {
          tags: {
            area: 'documents-update',
            flow: 'permission-denied',
          },
          extra: { projectId, zipFileId },
        },
      );
      toast.error(t('Documents.updateDocuments.diff.rejectError'));
      return;
    }
    setRejectError(false);
    try {
      await submitDecision.mutateAsync({
        path: { file_id: zipFileId },
        query: { decision: 'reject' },
      });
    } catch (error) {
      if (isHandledProjectVersionConflictError(error)) {
        return;
      }
      Sentry.captureException(error, {
        tags: {
          area: 'documents-update',
          flow: 'reject',
          stage: 'submit-decision',
        },
        extra: { projectId, zipFileId },
      });
      setRejectError(true);
      toast.error(t('Documents.updateDocuments.diff.rejectError'));
      return;
    }
    await invalidateForProject(projectId);
    onRejected();
  };

  return {
    reject,
    isRejecting: submitDecision.isPending,
    rejectError,
  };
};
