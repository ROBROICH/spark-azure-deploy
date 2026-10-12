import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FvpCategoryState } from '@/features/project/fvp/data/useFvpCategoryData';
import { useFvpAiWorkflowState } from './useFvpAiWorkflowState';

const testWorkflow = {
  workflowStartTime: null,
};

const makeCategoryState = (
  overrides: Partial<FvpCategoryState> = {},
): FvpCategoryState => {
  const status = overrides.status ?? 'idle';
  const isDone = overrides.isDone ?? status === 'ready';
  const isRunning = overrides.isRunning ?? status === 'running';
  const isLoading =
    overrides.isLoading ?? (status === 'loading' || status === 'running');

  return {
    status,
    data: null,
    failureCode: null,
    hasResult: isDone,
    hasReadError: false,
    isDone,
    isLoading,
    isRunning,
    workflow: testWorkflow,
    ...overrides,
  };
};

const mocks = vi.hoisted(() => ({
  useProjectFiles: vi.fn(),
  useSystemLoad: vi.fn(),
  useProjectRouteVersion: vi.fn(),
  useFvpDocumentsSectionReadiness: vi.fn(),
  useTocData: vi.fn(),
  useFcsData: vi.fn(),
  usePpData: vi.fn(),
  useFvpWorkflowContext: vi.fn(),
}));

vi.mock(
  '@/features/workflow-runtime/workflow-status/FvpWorkflowContext',
  () => ({ useFvpWorkflowContext: mocks.useFvpWorkflowContext }),
);

vi.mock('@/features/project/data/project-files/useProjectFiles', () => ({
  useProjectFiles: mocks.useProjectFiles,
}));

vi.mock(
  '@/features/project/fvp/main-screen/data/read-model/useFvpDocumentsSectionReadiness',
  () => ({
    useFvpDocumentsSectionReadiness: mocks.useFvpDocumentsSectionReadiness,
  }),
);

vi.mock('@/features/project/fvp/data/useFvpCategoryData', () => ({
  useTocData: mocks.useTocData,
  useFcsData: mocks.useFcsData,
  usePpData: mocks.usePpData,
}));

vi.mock('@/features/workflow-runtime/system-load/useSystemLoad', () => ({
  useSystemLoad: mocks.useSystemLoad,
}));

vi.mock('@/features/project/versioning/projectVersioning', () => ({
  useProjectRouteVersion: mocks.useProjectRouteVersion,
}));

describe('useFvpAiWorkflowState', () => {
  beforeEach(() => {
    mocks.useProjectFiles.mockReturnValue({
      files: [{ id: 'file-1' }],
      isLoading: false,
    });
    mocks.useSystemLoad.mockReturnValue({
      disableThresholdPercentage: 500,
      isError: false,
      isLoading: false,
      isSystemLoadHigh: false,
    });
    mocks.useProjectRouteVersion.mockReturnValue(1);
    mocks.useFvpDocumentsSectionReadiness.mockReturnValue({
      isLoading: false,
    });
    mocks.useTocData.mockReturnValue(makeCategoryState());
    mocks.useFcsData.mockReturnValue(makeCategoryState());
    mocks.usePpData.mockReturnValue(makeCategoryState());
    mocks.useFvpWorkflowContext.mockReturnValue({
      workflowState: { latestFailure: null },
    });
  });

  it('blocks FVP start while the system-load gate is active', () => {
    mocks.useSystemLoad.mockReturnValue({
      disableThresholdPercentage: 500,
      isError: false,
      isLoading: false,
      isSystemLoadHigh: true,
    });

    const { result } = renderHook(() => useFvpAiWorkflowState('project-1'));

    expect(result.current.canStartProcess).toBe(false);
    expect(result.current.isStartBlockedBySystemLoad).toBe(true);
    expect(result.current.isStartButtonDisabled).toBe(true);
    expect(result.current.startButtonDisabledReason).toBe('systemLoad');
  });

  it('reports missing documents as the disabled start reason', () => {
    mocks.useProjectFiles.mockReturnValue({
      files: [],
      isLoading: false,
    });

    const { result } = renderHook(() => useFvpAiWorkflowState('project-1'));

    expect(result.current.canStartProcess).toBe(false);
    expect(result.current.isStartButtonDisabled).toBe(true);
    expect(result.current.startButtonDisabledReason).toBe('missingDocuments');
  });

  it('composes completed category states into completed analysis and documents gates', () => {
    mocks.useTocData.mockReturnValue(makeCategoryState({ status: 'ready' }));
    mocks.useFcsData.mockReturnValue(makeCategoryState({ status: 'ready' }));
    mocks.usePpData.mockReturnValue(makeCategoryState({ status: 'ready' }));

    const { result } = renderHook(() => useFvpAiWorkflowState('project-1'));

    expect(result.current.isAiAnalysisComplete).toBe(true);
    expect(result.current.canShowDocuments).toBe(true);
    expect(result.current.shouldShowStartAction).toBe(false);
    expect(result.current.canStartProcess).toBe(false);
    expect(result.current.progress).toMatchObject({
      tableOfContents: { isDone: true, isLoading: false },
      requiredDocuments: { isDone: true, isLoading: false },
      plausibility: { isDone: true, isLoading: false },
    });
  });

  it('keeps documents hidden until both TOC and FCS are done', () => {
    mocks.useTocData.mockReturnValue(makeCategoryState({ status: 'ready' }));
    mocks.useFcsData.mockReturnValue(makeCategoryState({ status: 'idle' }));

    const { result } = renderHook(() => useFvpAiWorkflowState('project-1'));

    expect(result.current.canShowDocuments).toBe(false);
    expect(result.current.isAiAnalysisComplete).toBe(false);
  });

  it('keeps the initial page decision loading while category reads are unresolved', () => {
    mocks.useTocData.mockReturnValue(makeCategoryState({ status: 'loading' }));
    mocks.useFcsData.mockReturnValue(makeCategoryState({ status: 'loading' }));
    mocks.usePpData.mockReturnValue(makeCategoryState({ status: 'loading' }));

    const { result } = renderHook(() => useFvpAiWorkflowState('project-1'));

    expect(result.current.isAiAnalysisDecisionLoading).toBe(true);
    expect(result.current.isAiAnalysisRunning).toBe(false);
  });

  it('does not blank the page while a category workflow is running', () => {
    mocks.useTocData.mockReturnValue(makeCategoryState({ status: 'running' }));

    const { result } = renderHook(() => useFvpAiWorkflowState('project-1'));

    expect(result.current.isAiAnalysisDecisionLoading).toBe(false);
    expect(result.current.isAiAnalysisRunning).toBe(true);
  });

  it('keeps a finished page decision loading until the documents section reads are ready', () => {
    mocks.useTocData.mockReturnValue(makeCategoryState({ status: 'ready' }));
    mocks.useFcsData.mockReturnValue(makeCategoryState({ status: 'ready' }));
    mocks.usePpData.mockReturnValue(makeCategoryState({ status: 'ready' }));
    mocks.useFvpDocumentsSectionReadiness.mockReturnValue({
      isLoading: true,
    });

    const { result } = renderHook(() => useFvpAiWorkflowState('project-1'));

    expect(result.current.isAiAnalysisComplete).toBe(true);
    expect(result.current.canShowDocuments).toBe(true);
    expect(result.current.isAiAnalysisDecisionLoading).toBe(true);
  });

  it('prefers live running workflow state over persisted category completion', () => {
    mocks.useTocData.mockReturnValue(makeCategoryState({ status: 'ready' }));
    mocks.useFcsData.mockReturnValue(makeCategoryState({ status: 'running' }));
    mocks.usePpData.mockReturnValue(makeCategoryState({ status: 'ready' }));

    const { result } = renderHook(() => useFvpAiWorkflowState('project-1'));

    expect(result.current.isAiAnalysisRunning).toBe(true);
    expect(result.current.isAiAnalysisComplete).toBe(false);
    expect(result.current.canStartProcess).toBe(false);
    expect(result.current.progress.requiredDocuments).toMatchObject({
      isDone: false,
      isLoading: true,
    });
  });

  it('hides the manual start action for project versions above one', () => {
    mocks.useProjectRouteVersion.mockReturnValue(2);

    const { result } = renderHook(() => useFvpAiWorkflowState('project-1'));

    expect(result.current.shouldShowStartAction).toBe(false);
    expect(result.current.canStartProcess).toBe(false);
    expect(result.current.isStartButtonDisabled).toBe(true);
  });

  it('passes TOC and FCS readiness into the PP category hook', () => {
    mocks.useTocData.mockReturnValue(makeCategoryState({ status: 'ready' }));
    mocks.useFcsData.mockReturnValue(makeCategoryState({ status: 'ready' }));

    renderHook(() => useFvpAiWorkflowState('project-1'));

    expect(mocks.usePpData).toHaveBeenCalledWith('project-1', {
      fcsReady: true,
      tocReady: true,
    });
  });

  it('settles a failed upstream category for plausibility and marks the analysis incomplete', () => {
    mocks.useTocData.mockReturnValue(
      makeCategoryState({ status: 'failed', failureCode: 'ANALYSIS_FAILED' }),
    );
    mocks.useFcsData.mockReturnValue(makeCategoryState({ status: 'ready' }));
    mocks.usePpData.mockReturnValue(makeCategoryState({ status: 'ready' }));

    const { result } = renderHook(() => useFvpAiWorkflowState('project-1'));

    expect(mocks.usePpData).toHaveBeenCalledWith('project-1', {
      fcsReady: true,
      tocReady: true,
    });
    expect(result.current.isAiAnalysisIncomplete).toBe(true);
    expect(result.current.isAiAnalysisComplete).toBe(false);
  });

  it('marks the analysis incomplete when the run failed outside every category', () => {
    mocks.useTocData.mockReturnValue(makeCategoryState({ status: 'ready' }));
    mocks.useFcsData.mockReturnValue(makeCategoryState({ status: 'ready' }));
    mocks.usePpData.mockReturnValue(makeCategoryState({ status: 'ready' }));
    mocks.useFvpWorkflowContext.mockReturnValue({
      workflowState: {
        latestFailure: {
          errorCode: 'ANALYSIS_FAILED',
          branches: [
            { branch: 'inhaltsextraktion', errorCode: 'ANALYSIS_FAILED' },
          ],
        },
      },
    });

    const { result } = renderHook(() => useFvpAiWorkflowState('project-1'));

    expect(result.current.isAiAnalysisIncomplete).toBe(true);
    expect(result.current.isAiAnalysisComplete).toBe(false);
    expect(result.current.shouldShowStartAction).toBe(true);
  });

  it('keeps the documents visible when a rerun fails after an earlier result', () => {
    mocks.useTocData.mockReturnValue(
      makeCategoryState({
        status: 'failed',
        failureCode: 'ANALYSIS_FAILED',
        hasResult: true,
      }),
    );
    mocks.useFcsData.mockReturnValue(makeCategoryState({ status: 'ready' }));

    const { result, rerender } = renderHook(() =>
      useFvpAiWorkflowState('project-1'),
    );

    expect(result.current.canShowDocuments).toBe(true);

    mocks.useTocData.mockReturnValue(
      makeCategoryState({
        status: 'failed',
        failureCode: 'ANALYSIS_FAILED',
        hasResult: false,
      }),
    );
    rerender();

    expect(result.current.canShowDocuments).toBe(false);
  });
});
