import { useTableOfContentsDocuments } from '@/features/project/fvp/main-screen/data/read-model/useTableOfContentsDocuments';
import { useAllRequiredDocuments } from '@/features/project/fvp/main-screen/data/read-model/useRequiredDocuments';
import { useFormalDocumentSummary } from '@/features/project/fvp/main-screen/data/read-model/useDocuments';
import { contradictionsCollection } from '@/features/project/fvp/data/plausibility/contradictions.collection';
import {
  retryPlausibilityReads,
  retryRequiredDocumentsReads,
  retryTableOfContentsReads,
} from './fvpResultReads';
import {
  useRunningWorkflow,
  WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
  WORKFLOW_TYPE_FVP,
  WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING,
  WORKFLOW_TYPE_LLM_MATCHING,
} from '@/features/workflow-runtime/workflow-status/useRunningWorkflow';
import { useFvpWorkflowContext } from '@/features/workflow-runtime/workflow-status/FvpWorkflowContext';
import type { WorkflowStartTimeSource } from '@/features/workflow-runtime/workflow-status/workflowProgressPrediction';
import type { WorkflowFailureCode } from '@/features/workflow-runtime/workflow-status/workflowStatus.types';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

export type FvpCategoryStatus =
  | 'idle'
  | 'loading'
  | 'running'
  | 'ready'
  | 'failed';

export type FvpCategoryState<TData = null> = {
  status: FvpCategoryStatus;
  data: TData | null;
  /** The latest run's failure code for this category, or `null`. */
  failureCode: WorkflowFailureCode | null;
  /**
   * Persisted content exists, possibly from an earlier successful run. A
   * resolved but empty read is no result, so a failed first run shows only
   * its failure.
   */
  hasResult: boolean;
  /**
   * The read that decides `hasResult` failed, so whether an earlier result
   * exists is unknown.
   */
  hasReadError: boolean;
  isDone: boolean;
  isLoading: boolean;
  isRunning: boolean;
  workflow: WorkflowStartTimeSource;
};

type FvpRunningWorkflowProgress = {
  isLoading: boolean;
  isRunning: boolean;
  latestRunningWorkflow?: WorkflowStartTimeSource;
};

const emptyWorkflow: WorkflowStartTimeSource = {
  workflowStartTime: null,
};

const getFvpCategoryRunningWorkflow = (
  parentWorkflow: FvpRunningWorkflowProgress,
  categoryWorkflow: FvpRunningWorkflowProgress,
): FvpRunningWorkflowProgress => ({
  isLoading: parentWorkflow.isLoading || categoryWorkflow.isLoading,
  isRunning: parentWorkflow.isRunning || categoryWorkflow.isRunning,
  latestRunningWorkflow:
    categoryWorkflow.latestRunningWorkflow ??
    parentWorkflow.latestRunningWorkflow,
});

const useFvpCategoryRunningWorkflow = (workflowType: string) => {
  const parentWorkflow = useRunningWorkflow({
    workflowType: WORKFLOW_TYPE_FVP,
  });
  const categoryWorkflow = useRunningWorkflow({
    workflowType,
  });

  return getFvpCategoryRunningWorkflow(parentWorkflow, categoryWorkflow);
};

const hasQueryResolved = (
  queryState:
    | {
        dataUpdatedAt: number;
        status: string;
      }
    | undefined,
) =>
  Boolean(
    queryState &&
    (queryState.dataUpdatedAt > 0 || queryState.status === 'error'),
  );

const useRefreshReadsWhenWorkflowSettles = (args: {
  isRunning: boolean;
  refreshReads: () => void;
}) => {
  const { isRunning, refreshReads } = args;
  const wasRunningRef = useRef(isRunning);

  // eslint-disable-next-line no-restricted-syntax -- refreshes durable result reads when the external running-workflow read model reports a workflow settling.
  useEffect(() => {
    const wasRunning = wasRunningRef.current;
    wasRunningRef.current = isRunning;

    if (wasRunning && !isRunning) {
      refreshReads();
    }
  }, [isRunning, refreshReads]);
};

const getCategoryStatus = (args: {
  failureCode: WorkflowFailureCode | null;
  hasResolvedData: boolean;
  hasResolvedRead: boolean;
  isReadLoading: boolean;
  runningWorkflow: FvpRunningWorkflowProgress;
}): FvpCategoryStatus => {
  if (args.runningWorkflow.isRunning) {
    return 'running';
  }
  if (args.failureCode !== null) {
    return 'failed';
  }
  if (args.hasResolvedData) {
    return 'ready';
  }
  if (
    args.runningWorkflow.isLoading ||
    args.isReadLoading ||
    !args.hasResolvedRead
  ) {
    return 'loading';
  }
  return 'idle';
};

const getCategoryState = <TData>(args: {
  data: TData | null;
  failureCode: WorkflowFailureCode | null;
  hasResolvedData: boolean;
  hasResolvedRead: boolean;
  hasReadError: boolean;
  hasResult: boolean;
  isReadLoading: boolean;
  runningWorkflow: FvpRunningWorkflowProgress;
}): FvpCategoryState<TData> => {
  const { data, failureCode, hasReadError, hasResult, runningWorkflow } = args;
  const workflow = runningWorkflow.latestRunningWorkflow ?? emptyWorkflow;
  const status = getCategoryStatus(args);

  return {
    status,
    data,
    failureCode: status === 'failed' ? failureCode : null,
    hasResult,
    hasReadError,
    isDone: status === 'ready',
    isLoading: status === 'loading' || status === 'running',
    isRunning: status === 'running',
    workflow,
  };
};

export const useTocData = (projectId: string) => {
  const queryClient = useQueryClient();
  const runningWorkflow = useFvpCategoryRunningWorkflow(
    WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING,
  );
  const { tableOfContentsWorkflow } = useFvpWorkflowContext();
  const {
    items,
    status,
    isLoading: isReadLoading,
    isError,
  } = useTableOfContentsDocuments(projectId);
  const tocResponseQueryKey = ['toc-notes-response', projectId];
  const hasResolvedTocResponse = hasQueryResolved(
    queryClient.getQueryState(tocResponseQueryKey),
  );
  const hasResolvedData = !isError && (items.length > 0 || status !== null);

  useRefreshReadsWhenWorkflowSettles({
    isRunning: runningWorkflow.isRunning,
    refreshReads: () => retryTableOfContentsReads(projectId),
  });

  return getCategoryState({
    data: { items, status },
    failureCode: tableOfContentsWorkflow.failureCode,
    hasResolvedData,
    hasResolvedRead: hasResolvedTocResponse || isError,
    hasReadError: isError,
    hasResult: hasResolvedData,
    isReadLoading,
    runningWorkflow,
  });
};

export const useFcsData = (projectId: string) => {
  const queryClient = useQueryClient();
  const runningWorkflow = useFvpCategoryRunningWorkflow(
    WORKFLOW_TYPE_LLM_MATCHING,
  );
  const { requiredDocumentsWorkflow } = useFvpWorkflowContext();
  const requiredDocumentsQueryKey = ['required-documents', projectId];
  const fetchingRequiredDocumentsCount = useIsFetching({
    queryKey: requiredDocumentsQueryKey,
  });
  const {
    documents: requiredDocuments,
    isLoading: requiredDocumentsLoading,
    isError: requiredDocumentsError,
  } = useAllRequiredDocuments(projectId);
  const documentSummary = useFormalDocumentSummary(projectId);
  const hasResolvedRequiredDocumentsResponse =
    hasQueryResolved(queryClient.getQueryState(requiredDocumentsQueryKey)) ||
    (!requiredDocumentsLoading && fetchingRequiredDocumentsCount === 0);
  const hasResolvedDocumentSummaryResponse = documentSummary.isFetched;
  const hasResolvedData =
    !requiredDocumentsError &&
    !documentSummary.isError &&
    hasResolvedRequiredDocumentsResponse &&
    hasResolvedDocumentSummaryResponse;

  useRefreshReadsWhenWorkflowSettles({
    isRunning: runningWorkflow.isRunning,
    refreshReads: () => retryRequiredDocumentsReads(projectId),
  });

  return getCategoryState({
    data: { requiredDocuments, documentSummary: documentSummary.data },
    failureCode: requiredDocumentsWorkflow.failureCode,
    hasResolvedData,
    hasResolvedRead:
      hasResolvedRequiredDocumentsResponse &&
      hasResolvedDocumentSummaryResponse,
    hasReadError: documentSummary.isError,
    // At least one document assigned to a required type is persisted content.
    hasResult:
      !documentSummary.isError &&
      (documentSummary.data?.assignedTypeIds.length ?? 0) > 0,
    isReadLoading:
      requiredDocumentsLoading ||
      documentSummary.isFetching ||
      fetchingRequiredDocumentsCount > 0,
    runningWorkflow,
  });
};

export const usePpData = (
  projectId: string,
  args: {
    fcsReady: boolean;
    tocReady: boolean;
  },
) => {
  const { fcsReady, tocReady } = args;
  const queryClient = useQueryClient();
  const runningWorkflow = useFvpCategoryRunningWorkflow(
    WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
  );
  const { plausibilityWorkflow } = useFvpWorkflowContext();
  const contradictionsQueryKey = ['pp-contradictions', projectId];
  const fetchingContradictionsCount = useIsFetching({
    queryKey: contradictionsQueryKey,
  });
  const {
    data: contradictions,
    isLoading: contradictionsLoading,
    isError: contradictionsError,
  } = useLiveQuery((q) =>
    q
      .from({ contradictionRows: contradictionsCollection })
      .where(({ contradictionRows }) =>
        eq(contradictionRows.projectId, projectId),
      ),
  );
  const hasResolvedContradictionsResponse = hasQueryResolved(
    queryClient.getQueryState(contradictionsQueryKey),
  );
  const hasFindings = contradictions.length > 0;
  const hasZeroFindings =
    tocReady &&
    fcsReady &&
    !runningWorkflow.isRunning &&
    hasResolvedContradictionsResponse &&
    contradictions.length === 0;

  useRefreshReadsWhenWorkflowSettles({
    isRunning: runningWorkflow.isRunning,
    refreshReads: () => retryPlausibilityReads(projectId),
  });

  return getCategoryState({
    data: contradictions,
    failureCode: plausibilityWorkflow.failureCode,
    hasResolvedData: !contradictionsError && (hasFindings || hasZeroFindings),
    hasResolvedRead: hasResolvedContradictionsResponse || contradictionsError,
    hasReadError: contradictionsError,
    hasResult: !contradictionsError && hasFindings,
    isReadLoading: contradictionsLoading || fetchingContradictionsCount > 0,
    runningWorkflow,
  });
};
