import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePpData, useTocData } from './useFvpCategoryData';

const mocks = vi.hoisted(() => ({
  retryPlausibilityReads: vi.fn(),
  retryRequiredDocumentsReads: vi.fn(),
  retryTableOfContentsReads: vi.fn(),
  runningWorkflowsByType: new Map<
    string,
    { isLoading?: boolean; isRunning: boolean }
  >(),
  tableOfContents: {
    items: [] as unknown[],
    status: null as string | null,
    isLoading: false,
    isError: false,
  },
  liveQueryData: [] as unknown[],
  queryStatesByKey: new Map<
    string,
    { dataUpdatedAt: number; status: string }
  >(),
}));

vi.mock('./fvpResultReads', () => ({
  retryPlausibilityReads: mocks.retryPlausibilityReads,
  retryRequiredDocumentsReads: mocks.retryRequiredDocumentsReads,
  retryTableOfContentsReads: mocks.retryTableOfContentsReads,
}));

vi.mock(
  '@/features/project/fvp/main-screen/data/read-model/useTableOfContentsDocuments',
  () => ({
    useTableOfContentsDocuments: () => mocks.tableOfContents,
  }),
);

vi.mock(
  '@/features/project/fvp/main-screen/data/read-model/useRequiredDocuments',
  () => ({
    useAllRequiredDocuments: () => ({
      documents: [],
      isLoading: false,
      isError: false,
    }),
  }),
);

vi.mock(
  '@/features/project/fvp/main-screen/data/collections/documentAssignments.collection',
  () => ({
    documentAssignmentsCollection: {},
  }),
);

vi.mock(
  '@/features/project/fvp/data/plausibility/contradictions.collection',
  () => ({
    contradictionsCollection: {},
  }),
);

vi.mock(
  '@/features/workflow-runtime/workflow-status/useRunningWorkflow',
  () => ({
    WORKFLOW_TYPE_CHECK_PLAUSIBILITY: 'PlausibilityMainOrchestratorWorkflow',
    WORKFLOW_TYPE_FVP: 'FVPWorkflow',
    WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING:
      'InhaltsverzeichnisMatchingWorkflow',
    WORKFLOW_TYPE_LLM_MATCHING: 'LLMMatchingWorkflow',
    useRunningWorkflow: ({ workflowType }: { workflowType?: string }) => ({
      isLoading:
        mocks.runningWorkflowsByType.get(workflowType ?? '')?.isLoading ??
        false,
      isRunning:
        mocks.runningWorkflowsByType.get(workflowType ?? '')?.isRunning ??
        false,
      latestRunningWorkflow: mocks.runningWorkflowsByType.get(
        workflowType ?? '',
      )?.isRunning
        ? {
            workflow_start_time: '2026-05-16T10:09:17.545079Z',
          }
        : undefined,
    }),
  }),
);

vi.mock('@tanstack/react-db', () => ({
  eq: vi.fn(),
  useLiveQuery: () => ({
    data: mocks.liveQueryData,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useIsFetching: () => 0,
  useQueryClient: () => ({
    getQueryState: (queryKey: unknown[]) =>
      mocks.queryStatesByKey.get(queryKey.join(':')),
  }),
}));

describe('useFvpCategoryData', () => {
  beforeEach(() => {
    mocks.retryPlausibilityReads.mockClear();
    mocks.retryRequiredDocumentsReads.mockClear();
    mocks.retryTableOfContentsReads.mockClear();
    mocks.runningWorkflowsByType.clear();
    mocks.tableOfContents = {
      items: [],
      status: null,
      isLoading: false,
      isError: false,
    };
    mocks.liveQueryData = [];
    mocks.queryStatesByKey.clear();
  });

  it('treats PP resolved empty as ready only after TOC and FCS are ready', () => {
    mocks.queryStatesByKey.set('pp-contradictions:p1', {
      dataUpdatedAt: 1,
      status: 'success',
    });

    const { result, rerender } = renderHook(
      ({ tocReady, fcsReady }: { tocReady: boolean; fcsReady: boolean }) =>
        usePpData('p1', { tocReady, fcsReady }),
      {
        initialProps: { tocReady: false, fcsReady: true },
      },
    );

    expect(result.current.status).toBe('idle');

    rerender({ tocReady: true, fcsReady: true });

    expect(result.current.status).toBe('ready');
    expect(result.current.isDone).toBe(true);
  });

  it('keeps PP running when the PP workflow is still active', () => {
    mocks.queryStatesByKey.set('pp-contradictions:p1', {
      dataUpdatedAt: 1,
      status: 'success',
    });
    mocks.runningWorkflowsByType.set('PlausibilityMainOrchestratorWorkflow', {
      isRunning: true,
    });

    const { result } = renderHook(() =>
      usePpData('p1', { tocReady: true, fcsReady: true }),
    );

    expect(result.current.status).toBe('running');
    expect(result.current.isDone).toBe(false);
  });

  it('keeps categories running while the parent FVP workflow is active', () => {
    mocks.queryStatesByKey.set('pp-contradictions:p1', {
      dataUpdatedAt: 1,
      status: 'success',
    });
    mocks.runningWorkflowsByType.set('FVPWorkflow', {
      isRunning: true,
    });

    const { result: tocResult } = renderHook(() => useTocData('p1'));
    const { result: ppResult } = renderHook(() =>
      usePpData('p1', { tocReady: true, fcsReady: true }),
    );

    expect(tocResult.current.status).toBe('running');
    expect(tocResult.current.isDone).toBe(false);
    expect(ppResult.current.status).toBe('running');
    expect(ppResult.current.isDone).toBe(false);
  });

  it('refreshes a category read when its workflow settles', () => {
    mocks.runningWorkflowsByType.set('InhaltsverzeichnisMatchingWorkflow', {
      isRunning: true,
    });
    const { rerender } = renderHook(() => useTocData('p1'));

    expect(mocks.retryTableOfContentsReads).not.toHaveBeenCalled();

    mocks.runningWorkflowsByType.clear();
    rerender();

    expect(mocks.retryTableOfContentsReads).toHaveBeenCalledWith('p1');
  });
});
