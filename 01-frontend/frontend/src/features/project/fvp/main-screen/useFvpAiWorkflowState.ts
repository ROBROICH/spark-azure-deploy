import { useProjectFiles } from '@/features/project/data/project-files/useProjectFiles';
import { useFvpDocumentsSectionReadiness } from '@/features/project/fvp/main-screen/data/read-model/useFvpDocumentsSectionReadiness';
import {
  type FvpCategoryState,
  useFcsData,
  usePpData,
  useTocData,
} from '@/features/project/fvp/data/useFvpCategoryData';
import { useSystemLoad } from '@/features/workflow-runtime/system-load/useSystemLoad';
import { useFvpWorkflowContext } from '@/features/workflow-runtime/workflow-status/FvpWorkflowContext';
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

// A failed category is settled: it shows its own failure and no longer holds
// back categories that wait for it.
export const isCategorySettled = (state: FvpCategoryState<unknown>) =>
  state.isDone || state.status === 'failed';

// A rerun that failed after an earlier success keeps that result, so the
// documents stay visible.
const hasCategoryResult = (state: FvpCategoryState<unknown>) =>
  state.isDone || (state.status === 'failed' && state.hasResult);

// A parent failure that no category owns, such as a failed content-extraction
// follow-up step, still leaves the analysis incomplete.
const getAiAnalysisCompletion = (args: {
  hasParentFailure: boolean;
  progress: ReturnType<typeof getWorkflowProgress>;
}) => {
  const categories = Object.values(args.progress);
  const isAiAnalysisRunning = categories.some(({ isRunning }) => isRunning);
  const isAiAnalysisIncomplete =
    categories.some(({ status }) => status === 'failed') ||
    (args.hasParentFailure && !isAiAnalysisRunning);
  const isAiAnalysisComplete =
    categories.every(({ isDone }) => isDone) && !isAiAnalysisIncomplete;
  return { isAiAnalysisComplete, isAiAnalysisIncomplete, isAiAnalysisRunning };
};

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
    fcsReady: isCategorySettled(requiredDocumentsState),
    tocReady: isCategorySettled(tableOfContentsState),
  });
  const progress = getWorkflowProgress(
    tableOfContentsState,
    requiredDocumentsState,
    plausibilityState,
  );
  const canShowDocuments =
    hasCategoryResult(tableOfContentsState) &&
    hasCategoryResult(requiredDocumentsState);
  const { isLoading: isDocumentsSectionLoading } =
    useFvpDocumentsSectionReadiness(verfahrenId);
  const { workflowState } = useFvpWorkflowContext();
  const completion = getAiAnalysisCompletion({
    hasParentFailure: workflowState.latestFailure !== null,
    progress,
  });
  const { isAiAnalysisComplete, isAiAnalysisRunning } = completion;
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
    ...completion,
    isAiAnalysisDecisionLoading,
    canShowDocuments,
    canStartProcess,
    disableThresholdPercentage,
    isStartBlockedBySystemLoad: isSystemLoadHigh,
    isStartButtonDisabled: isStartButtonLoading || !canStartProcess,
    isStartButtonLoading,
    shouldShowStartAction,
    startButtonDisabledReason,
    progress,
  };
};

export type FvpAiWorkflowState = ReturnType<typeof useFvpAiWorkflowState>;
