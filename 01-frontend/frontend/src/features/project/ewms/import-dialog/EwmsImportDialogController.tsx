import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { WORKFLOW_TYPE_FILE_PROCESSING } from '@/features/workflow-runtime/workflow-status/useRunningWorkflow';
import { isEwmsFeatureEnabled } from '@/features/project/ewms/ewmsFeature';
import { useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { EwmsImportJobState } from '../useEwmsImportJobState';
import { EwmsFileImportDialog } from './EwmsFileImportDialog';
import type { EwmsZipProcessingWorkflow } from './uploadEwmsZip';

const projectRoute = getRouteApi('/verfahren/$verfahrenId');
const route = getRouteApi('/verfahren/$verfahrenId/ewms/');

type EwmsImportDialogControllerProps = {
  importJobState: Pick<
    EwmsImportJobState,
    'isEwmsFileImportWorkflowRunning' | 'isLoading'
  >;
};

/** Connects the EWMS ZIP import dialog to route state and project mutation permissions. */
export const EwmsImportDialogController = (
  props: EwmsImportDialogControllerProps,
) => {
  const { importJobState } = props;
  const { importDialogOpen } = route.useSearch();
  const { verfahrenId } = route.useParams();
  const { workflowsManager } = projectRoute.useLoaderData();
  const navigate = route.useNavigate();
  const queryClient = useQueryClient();
  const isFeatureEnabled = isEwmsFeatureEnabled();
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const isEwmsFileImportWorkflowStateLoading = importJobState.isLoading;
  /* eslint-disable no-restricted-syntax -- this marks the one-shot review session for an upload started from this dialog. */
  const [isReviewingStartedImport, setIsReviewingStartedImport] =
    useState(false);
  /* eslint-enable no-restricted-syntax */
  const isImportBlocked =
    !canMutateProject ||
    (importJobState.isEwmsFileImportWorkflowRunning &&
      !isReviewingStartedImport);
  const isDialogOpen =
    importDialogOpen === true &&
    (!isImportBlocked || isEwmsFileImportWorkflowStateLoading);

  // eslint-disable-next-line no-restricted-syntax -- URL state is an external system; direct links must not keep a blocked import dialog armed for later.
  useEffect(() => {
    if (
      importDialogOpen !== true ||
      !isImportBlocked ||
      isEwmsFileImportWorkflowStateLoading
    ) {
      return;
    }

    navigate({
      replace: true,
      search: (prev) => ({
        ...prev,
        importDialogOpen: undefined,
      }),
      resetScroll: false,
    });
  }, [
    importDialogOpen,
    isEwmsFileImportWorkflowStateLoading,
    isImportBlocked,
    navigate,
  ]);

  if (!isFeatureEnabled) {
    return null;
  }

  const handleOpenChange = (open: boolean) => {
    if (open && isImportBlocked) {
      return;
    }

    if (!open) {
      setIsReviewingStartedImport(false);
    }

    navigate({
      search: (prev) => ({
        ...prev,
        importDialogOpen: open ? true : undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const handleUploaded = async () => {
    setIsReviewingStartedImport(true);

    await Promise.allSettled([
      workflowsManager.refetch({
        includeChildren: true,
        workflowType: WORKFLOW_TYPE_FILE_PROCESSING,
      }),
      workflowsManager.refetchRunning(),
      queryClient.invalidateQueries({ queryKey: ['files', verfahrenId] }),
      queryClient.invalidateQueries({
        queryKey: ['ewms-documents', verfahrenId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['processing-files', verfahrenId],
      }),
    ]);
  };

  const handleUploadStarted = () => {
    setIsReviewingStartedImport(true);

    // Block follow-up imports immediately while the page itself still waits for
    // the EWMS orchestrator before switching from landing to processing.
    void workflowsManager.observeStartedWorkflow(
      `${WORKFLOW_TYPE_FILE_PROCESSING}-${verfahrenId}`,
      {
        workflowType: WORKFLOW_TYPE_FILE_PROCESSING,
      },
    );
  };

  const handleProcessingStarted = async (
    processingWorkflow: EwmsZipProcessingWorkflow,
  ) => {
    setIsReviewingStartedImport(true);

    await workflowsManager.observeStartedWorkflow(
      processingWorkflow.workflowId,
      {
        workflowType: WORKFLOW_TYPE_FILE_PROCESSING,
      },
    );
  };

  return (
    <EwmsFileImportDialog
      key={isDialogOpen ? 'open' : 'closed'}
      open={isDialogOpen}
      projectId={verfahrenId}
      isImportStatusLoading={isEwmsFileImportWorkflowStateLoading}
      onOpenChange={handleOpenChange}
      onProcessingStarted={handleProcessingStarted}
      onUploadStarted={handleUploadStarted}
      onUploaded={handleUploaded}
    />
  );
};
