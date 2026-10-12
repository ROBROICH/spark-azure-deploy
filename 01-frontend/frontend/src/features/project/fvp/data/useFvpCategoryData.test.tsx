import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFcsData, usePpData, useTocData } from './useFvpCategoryData';

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
  assignedTypeIds: [] as string[],
  queryStatesByKey: new Map<
    string,
    { dataUpdatedAt: number; status: string }
  >(),
  failureCodes: {
    tableOfContents: null as string | null,
    requiredDocuments: null as string | null,
    plausibility: null as string | null,
  },
}));

vi.mock(
  '@/features/workflow-runtime/workflow-status/FvpWorkflowContext',
  () => ({
    useFvpWorkflowContext: () => ({
      tableOfContentsWorkflow: {
        failureCode: mocks.failureCodes.tableOfContents,
      },
      requiredDocumentsWorkflow: {
        failureCode: mocks.failureCodes.requiredDocuments,
      },
      plausibilityWorkflow: { failureCode: mocks.failureCodes.plausibility },
    }),
  }),
);

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
  '@/features/project/fvp/main-screen/data/read-model/useDocuments',
  () => ({
    useFormalDocumentSummary: () => ({
      data: { assignedTypeIds: mocks.assignedTypeIds },
      isFetched: true,
      isFetching: false,
      isError: false,
    }),
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
            workflowStartTime: '2026-05-16T10:09:17.545079Z',
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
    mocks.assignedTypeIds = [];
    mocks.queryStatesByKey.clear();
    mocks.failureCodes = {
      tableOfContents: null,
      requiredDocuments: null,
      plausibility: null,
    };
  });

  it('reports a failed category with its code and whether an earlier result exists', () => {
    mocks.failureCodes.tableOfContents = 'ANALYSIS_TIMED_OUT';

    const { result, rerender } = renderHook(() => useTocData('p1'));

    expect(result.current).toMatchObject({
      status: 'failed',
      failureCode: 'ANALYSIS_TIMED_OUT',
      hasResult: false,
      isDone: false,
    });

    mocks.tableOfContents = { ...mocks.tableOfContents, status: 'complete' };
    rerender();

    expect(result.current).toMatchObject({
      status: 'failed',
      hasResult: true,
    });
  });

  it('reports no earlier result for a failed first required-documents run with resolved empty reads', () => {
    mocks.failureCodes.requiredDocuments = 'ANALYSIS_FAILED';
    mocks.queryStatesByKey.set('required-documents:p1', {
      dataUpdatedAt: 1,
      status: 'success',
    });

    const { result, rerender } = renderHook(() => useFcsData('p1'));

    expect(result.current).toMatchObject({
      status: 'failed',
      hasResult: false,
    });

    mocks.assignedTypeIds = ['required-type-1'];
    rerender();

    expect(result.current.hasResult).toBe(true);
  });

  it('reports a new run as running, not failed, while it is active', () => {
    mocks.failureCodes.tableOfContents = 'ANALYSIS_FAILED';
    mocks.runningWorkflowsByType.set('FVPWorkflow', { isRunning: true });

    const { result } = renderHook(() => useTocData('p1'));

    expect(result.current.status).toBe('running');
    expect(result.current.failureCode).toBeNull();
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
