import type { FileDiffResponse } from '@/api-clients/dms-module';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { isHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';
import { toast } from '@/features/ui/toast/Toast';
import { router } from '@/integrations/router/router';
import * as Sentry from '@sentry/react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildTrimmedDiff } from '../documentDiff.utils';
import type { ApprovalActions } from './useApprovalActions';
import { useInvalidateUploadCaches } from './useInvalidateUploadCaches';

type ConfirmParams = {
  zipFileId: string | null;
  projectId: string | null;
  diff: FileDiffResponse | null;
  selectedKeys: Set<string>;
  onApproved: () => void;
};

/**
 * Discriminator for which mutation in the approve-diff flow failed last,
 * so callers can show targeted retry hints instead of one conflated boolean.
 */
type ApproveErrorPhase = 'set-diff' | 'submit-decision' | null;

/**
 * Encapsulates the "confirm diff and approve upload" flow: pushes the user-edited
 * diff to the backend, signals approval, invalidates the full set of caches
 * affected by a new project version, and reports per-mutation pending and error
 * state for the dialog step to render.
 *
 * The shared `ApprovalActions` instance must be passed in by the caller so the
 * dialog only mounts the underlying mutations once (no parallel mutation state).
 *
 * @param approvalActions Shared approval-flow mutations mounted once by the dialog provider.
 * @returns confirm — runs the flow; isSavingDiff / isSubmittingDecision — per-mutation pending flags; isSubmitting — true while either mutation is pending; approveError — phase that failed, or null after success / before any attempt.
 */
// eslint-disable-next-line custom-size/limit-logic-function-lines -- hook intentionally co-locates the permission gate, per-stage Sentry telemetry, failure handler, and cache-invalidation block for one approve-diff flow; splitting them further regresses readability without adding test seams.
export const useConfirmDiffApproval = (approvalActions: ApprovalActions) => {
  const { setFileDiff, submitDecision } = approvalActions;
  const queryClient = useQueryClient();
  const { invalidateForWorkflowTransition } = useInvalidateUploadCaches();
  const { t } = useTranslation('Project');
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  // eslint-disable-next-line no-restricted-syntax -- approve error is transient feedback scoped to the diff dialog step.
  const [approveError, setApproveError] = useState<ApproveErrorPhase>(null);

  const isSavingDiff = setFileDiff.isPending;
  const isSubmittingDecision = submitDecision.isPending;
  const isSubmitting = isSavingDiff || isSubmittingDecision;

  const handleApproveFailure = async (
    stage: Exclude<ApproveErrorPhase, null>,
    error: unknown,
    zipFileId: string,
    projectId: string,
  ) => {
    Sentry.captureException(error, {
      tags: { area: 'documents-update', flow: 'approve', stage },
      extra: { projectId, zipFileId },
    });
    setApproveError(stage);
    toast.error(t('Documents.updateDocuments.diff.approveError'));
    await queryClient.invalidateQueries({
      queryKey: ['zip-file-diff', zipFileId],
    });
  };

  /**
   * Pushes the trimmed diff and approve signal to the backend, then invalidates
   * every cache that a new approved version affects (files, processing files,
   * projects, temporal workflows, and active route loader data) so the UI can
   * refetch in lockstep.
   * Surfaces a toast and a phase-tagged `approveError` on failure so the caller
   * can render a targeted retry affordance.
   *
   * Fails closed when `projectId` is missing or the caller lacks project
   * mutate rights: the remote write is skipped and the failure is reported to
   * Sentry, since approval has no meaning without an owning project and a
   * permitted actor.
   *
   * @param params Workflow IDs, the original diff, the user's selection, and the post-approval transition callback.
   * @returns A promise that resolves once mutations settle and downstream invalidation/transition runs.
   */
  const confirm = async (params: ConfirmParams) => {
    const { zipFileId, projectId, diff, selectedKeys, onApproved } = params;
    if (!zipFileId || !diff) {
      return;
    }
    if (!projectId) {
      Sentry.captureException(
        new Error(
          'useConfirmDiffApproval.confirm called without a projectId; remote write skipped.',
        ),
        { extra: { zipFileId } },
      );
      return;
    }
    if (!canMutateProject) {
      Sentry.captureException(
        new Error(
          'useConfirmDiffApproval.confirm called without project mutate rights; remote write skipped.',
        ),
        {
          tags: {
            area: 'documents-update',
            flow: 'permission-denied',
          },
          extra: { projectId, zipFileId },
        },
      );
      toast.error(t('Documents.updateDocuments.diff.approveError'));
      return;
    }
    setApproveError(null);
    const trimmed = buildTrimmedDiff(diff, selectedKeys);

    try {
      await setFileDiff.mutateAsync({
        path: { file_id: zipFileId },
        body: trimmed,
      });
    } catch (error) {
      if (isHandledProjectVersionConflictError(error)) {
        return;
      }
      await handleApproveFailure('set-diff', error, zipFileId, projectId);
      return;
    }

    try {
      await submitDecision.mutateAsync({
        path: { file_id: zipFileId },
        query: { decision: 'approve' },
      });
    } catch (error) {
      if (isHandledProjectVersionConflictError(error)) {
        return;
      }
      await handleApproveFailure(
        'submit-decision',
        error,
        zipFileId,
        projectId,
      );
      return;
    }

    await invalidateForWorkflowTransition(projectId);
    await router.invalidate({
      filter: (match) =>
        'verfahrenId' in match.params && match.params.verfahrenId === projectId,
      sync: true,
    });
    await queryClient.refetchQueries({
      queryKey: ['processing-files', projectId],
      type: 'active',
    });
    onApproved();
  };

  return {
    confirm,
    isSubmitting,
    isSavingDiff,
    isSubmittingDecision,
    approveError,
  };
};
