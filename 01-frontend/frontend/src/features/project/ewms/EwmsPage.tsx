import { useGraph } from '@/db/nodes/ProjectGraphProvider';
import { isEwmsFeatureEnabled } from '@/features/project/ewms/ewmsFeature';
import { toast } from '@/features/ui/toast/Toast';
import { getRouteApi } from '@tanstack/react-router';
import { Suspense, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveEwmsViewState } from './ewmsWorkflowStatus';
import { EwmsImportDialogController } from './import-dialog/EwmsImportDialogController';
import { EwmsLandingPage } from './landing/EwmsLandingPage';
import { ErwiderungImportDialogController } from './response-import-dialog/ErwiderungImportDialogController';
import { useEwmsImportJobState } from './useEwmsImportJobState';
import { EwmsLoadingPage } from './workspace/EwmsLoadingPage';
import { EwmsSubtopicsProvider } from './workspace/EwmsSubtopicsContext';
import { EwmsWorkspace } from './workspace/EwmsWorkspace';
import { EwmsWorkspaceSkeleton } from './workspace/EwmsWorkspaceSkeleton';
import { useEwmsWorkflowDataRefresh } from './workspace/useEwmsWorkflowDataRefresh';

const route = getRouteApi('/verfahren/$verfahrenId/ewms/');

const useEwmsImportJobStateErrorToast = (isError: boolean) => {
  const { t } = useTranslation('Ewms');
  const wasErrorRef = useRef(false);

  // eslint-disable-next-line no-restricted-syntax -- reports an external Temporal status read failure once per failing transition.
  useEffect(() => {
    const wasError = wasErrorRef.current;
    wasErrorRef.current = isError;

    if (!wasError && isError) {
      toast.error(t('importDialog.statusError'));
    }
  }, [isError, t]);
};

export const EwmsPage = () => {
  const isFeatureEnabled = isEwmsFeatureEnabled();
  const { verfahrenId } = route.useParams();
  const { getNodesByType } = useGraph();
  const firstSwimlaneRefs = getNodesByType('beteiligungs_eingang');
  const hasFirstSwimlaneData = firstSwimlaneRefs.length > 0;
  // FileProcessing still belongs to the import dialog. The page enters the
  // processing state only once the EWMS orchestrator starts.
  const ewmsImportJobState = useEwmsImportJobState(verfahrenId);
  const { isEwmsWorkflowRunning, latestRunningWorkflow } = ewmsImportJobState;
  const ewmsImportDialogState = {
    isEwmsFileImportWorkflowRunning:
      ewmsImportJobState.isEwmsFileImportWorkflowRunning,
    isLoading: ewmsImportJobState.isLoading,
  };
  useEwmsWorkflowDataRefresh({
    isEwmsWorkflowRunning,
    projectId: verfahrenId,
    shouldRefreshProcessingData: isFeatureEnabled,
  });
  useEwmsImportJobStateErrorToast(ewmsImportJobState.isError);

  if (!isFeatureEnabled) {
    return <EwmsLandingPage isFeatureEnabled={false} />;
  }

  const viewState = resolveEwmsViewState({
    hasFirstSwimlaneData,
    isWorkflowRunning: isEwmsWorkflowRunning,
  });

  if (viewState === 'landing') {
    return (
      <>
        <EwmsLandingPage isFeatureEnabled />
        <EwmsImportDialogController importJobState={ewmsImportDialogState} />
      </>
    );
  }

  if (viewState === 'processing') {
    return (
      <>
        <EwmsLoadingPage
          projectId={verfahrenId}
          workflow={latestRunningWorkflow}
        />
        <EwmsImportDialogController importJobState={ewmsImportDialogState} />
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<EwmsWorkspaceSkeleton />}>
        <EwmsSubtopicsProvider>
          <EwmsWorkspace
            isEwmsFileImportWorkflowRunning={
              ewmsImportJobState.isEwmsFileImportWorkflowRunning
            }
          />
        </EwmsSubtopicsProvider>
      </Suspense>
      <EwmsImportDialogController importJobState={ewmsImportDialogState} />
      <ErwiderungImportDialogController />
    </>
  );
};
