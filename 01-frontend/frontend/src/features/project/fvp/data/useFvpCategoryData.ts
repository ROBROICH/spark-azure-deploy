import { useTableOfContentsDocuments } from '@/features/project/fvp/main-screen/data/read-model/useTableOfContentsDocuments';
import { useAllRequiredDocuments } from '@/features/project/fvp/main-screen/data/read-model/useRequiredDocuments';
import { documentAssignmentsCollection } from '@/features/project/fvp/main-screen/data/collections/documentAssignments.collection';
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
import type { WorkflowStartTimeSource } from '@/features/workflow-runtime/workflow-status/workflowProgressPrediction';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

export type FvpCategoryStatus = 'idle' | 'loading' | 'running' | 'ready';

export type FvpCategoryState<TData = null> = {
  status: FvpCategoryStatus;
  data: TData | null;
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
  workflow_start_time: undefined,
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

const getCategoryState = <TData>(args: {
  data: TData | null;
  hasResolvedData: boolean;
  hasResolvedRead: boolean;
  isReadLoading: boolean;
  runningWorkflow: FvpRunningWorkflowProgress;
}): FvpCategoryState<TData> => {
  const {
    data,
    hasResolvedData,
    hasResolvedRead,
    isReadLoading,
    runningWorkflow,
  } = args;
  const workflow = runningWorkflow.latestRunningWorkflow ?? emptyWorkflow;
  const status: FvpCategoryStatus = runningWorkflow.isRunning
    ? 'running'
    : hasResolvedData
      ? 'ready'
      : runningWorkflow.isLoading || isReadLoading || !hasResolvedRead
        ? 'loading'
        : 'idle';

  return {
    status,
    data,
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
    hasResolvedData,
    hasResolvedRead: hasResolvedTocResponse || isError,
    isReadLoading,
    runningWorkflow,
  });
};

export const useFcsData = (projectId: string) => {
  const queryClient = useQueryClient();
  const runningWorkflow = useFvpCategoryRunningWorkflow(
    WORKFLOW_TYPE_LLM_MATCHING,
  );
  const documentAssignmentsQueryKey = ['document-assignments', projectId];
  const requiredDocumentsQueryKey = ['required-documents', projectId];
  const fetchingDocumentAssignmentsCount = useIsFetching({
    queryKey: documentAssignmentsQueryKey,
  });
  const fetchingRequiredDocumentsCount = useIsFetching({
    queryKey: requiredDocumentsQueryKey,
  });
  const {
    documents: requiredDocuments,
    isLoading: requiredDocumentsLoading,
    isError: requiredDocumentsError,
  } = useAllRequiredDocuments(projectId);
  const {
    data: documentAssignments,
    isLoading: documentAssignmentsLoading,
    isError: documentAssignmentsError,
  } = useLiveQuery((q) =>
    q
      .from({ assignmentRows: documentAssignmentsCollection })
      .where(({ assignmentRows }) => eq(assignmentRows.projectId, projectId)),
  );
  const hasResolvedRequiredDocumentsResponse =
    hasQueryResolved(queryClient.getQueryState(requiredDocumentsQueryKey)) ||
    (!requiredDocumentsLoading && fetchingRequiredDocumentsCount === 0);
  const hasResolvedDocumentAssignmentsResponse = hasQueryResolved(
    queryClient.getQueryState(documentAssignmentsQueryKey),
  );
  const hasResolvedData =
    !requiredDocumentsError &&
    !documentAssignmentsError &&
    hasResolvedRequiredDocumentsResponse &&
    hasResolvedDocumentAssignmentsResponse;

  useRefreshReadsWhenWorkflowSettles({
    isRunning: runningWorkflow.isRunning,
    refreshReads: () => retryRequiredDocumentsReads(projectId),
  });

  return getCategoryState({
    data: { requiredDocuments, documentAssignments },
    hasResolvedData,
    hasResolvedRead:
      hasResolvedRequiredDocumentsResponse &&
      hasResolvedDocumentAssignmentsResponse,
    isReadLoading:
      requiredDocumentsLoading ||
      documentAssignmentsLoading ||
      fetchingDocumentAssignmentsCount > 0 ||
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
    hasResolvedData: !contradictionsError && (hasFindings || hasZeroFindings),
    hasResolvedRead: hasResolvedContradictionsResponse || contradictionsError,
    isReadLoading: contradictionsLoading || fetchingContradictionsCount > 0,
    runningWorkflow,
  });
};
