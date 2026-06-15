import { useProjectFiles } from '@/features/project/data/project-files/useProjectFiles';
import { useFvpDocumentsSectionReadiness } from '@/features/project/fvp/main-screen/data/read-model/useFvpDocumentsSectionReadiness';
import {
  type FvpCategoryState,
  useFcsData,
  usePpData,
  useTocData,
} from '@/features/project/fvp/data/useFvpCategoryData';
import { useSystemLoad } from '@/features/workflow-runtime/system-load/useSystemLoad';
import { useProjectRouteVersion } from '@/features/project/versioning/projectVersioning';
import { getStartButtonDisabledReason } from './startButtonDisabledReason';

const getWorkflowProgress = (
  tableOfContents: FvpCategoryState<unknown>,
  requiredDocuments: FvpCategoryState<unknown>,
  plausibility: FvpCategoryState<unknown>,
) => ({
  tableOfContents,
  requiredDocuments,
  plausibility,
});

/** Derives the FVP start, running-progress, result-card, and document-tree gates. */
export const useFvpAiWorkflowState = (verfahrenId: string) => {
  const projectVersion = useProjectRouteVersion();
  const {
    files: projectFiles,
    isLoading: isProjectFilesLoading,
    isError: isProjectFilesError,
  } = useProjectFiles(verfahrenId);
  const {
    isError: isSystemLoadError,
    isLoading: isSystemLoadLoading,
    isSystemLoadHigh,
    disableThresholdPercentage,
  } = useSystemLoad();
  const tableOfContentsState = useTocData(verfahrenId);
  const requiredDocumentsState = useFcsData(verfahrenId);
  const plausibilityState = usePpData(verfahrenId, {
    fcsReady: requiredDocumentsState.isDone,
    tocReady: tableOfContentsState.isDone,
  });
  const isTocDone = tableOfContentsState.isDone;
  const isFcsDone = requiredDocumentsState.isDone;
  const isPpDone = plausibilityState.isDone;
  const canShowDocuments = isTocDone && isFcsDone;
  const { isLoading: isDocumentsSectionLoading } =
    useFvpDocumentsSectionReadiness(verfahrenId);
  const isAiAnalysisComplete = isTocDone && isFcsDone && isPpDone;
  const isAiAnalysisRunning =
    tableOfContentsState.isRunning ||
    requiredDocumentsState.isRunning ||
    plausibilityState.isRunning;
  const isAiAnalysisDecisionLoading =
    !isAiAnalysisRunning &&
    ((!isAiAnalysisComplete &&
      (tableOfContentsState.status === 'loading' ||
        requiredDocumentsState.status === 'loading' ||
        plausibilityState.status === 'loading')) ||
      (canShowDocuments && isDocumentsSectionLoading));
  const hasProjectFiles = projectFiles.length > 0;
  const isStartBlockedBySystemLoad =
    isSystemLoadLoading || isSystemLoadError || isSystemLoadHigh;
  const shouldShowStartAction = projectVersion === 1 && !isAiAnalysisComplete;
  const canStartProcess =
    shouldShowStartAction &&
    hasProjectFiles &&
    !isAiAnalysisRunning &&
    !isStartBlockedBySystemLoad;
  const isStartButtonLoading = isProjectFilesLoading || isSystemLoadLoading;
  const startButtonDisabledReason = getStartButtonDisabledReason({
    hasProjectFiles,
    isProjectFilesError,
    isProjectFilesLoading,
    isSystemLoadError,
    isSystemLoadHigh,
  });

  return {
    isAiAnalysisComplete,
    isAiAnalysisDecisionLoading,
    canShowDocuments,
    canStartProcess,
    disableThresholdPercentage,
    isAiAnalysisRunning,
    isStartBlockedBySystemLoad: isSystemLoadHigh,
    isStartButtonDisabled: isStartButtonLoading || !canStartProcess,
    isStartButtonLoading,
    shouldShowStartAction,
    startButtonDisabledReason,
    progress: getWorkflowProgress(
      tableOfContentsState,
      requiredDocumentsState,
      plausibilityState,
    ),
  };
};

export type FvpAiWorkflowState = ReturnType<typeof useFvpAiWorkflowState>;
