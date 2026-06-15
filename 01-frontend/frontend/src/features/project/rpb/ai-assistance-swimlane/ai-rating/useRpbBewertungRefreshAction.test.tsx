import { act, renderHook } from '@testing-library/react';
import type * as TanstackReactQuery from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRpbBewertungRefreshAction } from './useRpbBewertungRefreshAction';

const mocks = vi.hoisted(() => ({
  isHandledProjectVersionConflictErrorMock: vi.fn(),
  mutateMock: vi.fn(),
  observeStartedMock: vi.fn(() => Promise.resolve()),
  toastMock: {
    error: vi.fn(),
  },
  workflowStates: [
    { isLoading: false, isRunning: false },
    { isLoading: false, isRunning: false },
  ],
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: mocks.toastMock,
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

vi.mock(
  '@/integrations/api-clients/projectVersionConflictHandledError',
  () => ({
    isHandledProjectVersionConflictError:
      mocks.isHandledProjectVersionConflictErrorMock,
  }),
);

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: (nodeType: string) => {
    if (nodeType === 'atomares_tbm') {
      return [{ id: 'tbm-1', node_type: 'atomares_tbm' }];
    }

    return [];
  },
}));

vi.mock(
  '@/features/workflow-runtime/workflow-status/useRunningWorkflow',
  () => ({
    WORKFLOW_TYPE_BEWERTUNG: 'bewertung',
    WORKFLOW_TYPE_SUZ_NORM: 'suche_zuordnung_norm',
    useRunningWorkflow: () => {
      const state = mocks.workflowStates.shift() ?? {
        isLoading: false,
        isRunning: false,
      };

      return {
        isLoading: state.isLoading,
        isRunning: state.isRunning,
        observeStarted: mocks.observeStartedMock,
      };
    },
  }),
);

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof TanstackReactQuery>();

  return {
    ...actual,
    useMutation: () => ({
      isPending: false,
      mutate: mocks.mutateMock,
    }),
  };
});

vi.mock(
  '@/api-clients/agent-orchestration-module/@tanstack/react-query.gen',
  () => ({
    startBewertungWorkflowWorkflowsBewertungPostMutation: () => ({}),
  }),
);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === 'aiAssistance.startAiAnalysisError'
        ? 'The AI analysis could not be started.'
        : key,
  }),
}));

describe('useRpbBewertungRefreshAction', () => {
  beforeEach(() => {
    mocks.isHandledProjectVersionConflictErrorMock.mockReset();
    mocks.mutateMock.mockReset();
    mocks.observeStartedMock.mockClear();
    mocks.toastMock.error.mockReset();
    mocks.workflowStates = [
      { isLoading: false, isRunning: false },
      { isLoading: false, isRunning: false },
    ];
    vi.mocked(Sentry.captureException).mockReset();
  });

  it('suppresses toast and Sentry for handled project-version conflicts', () => {
    const conflictError = new Error('handled conflict');
    mocks.isHandledProjectVersionConflictErrorMock.mockReturnValue(true);
    mocks.mutateMock.mockImplementation((_variables, callbacks) => {
      callbacks.onError(conflictError);
    });
    const { result } = renderHook(() =>
      useRpbBewertungRefreshAction({
        canMutateTopic: true,
        normId: 'norm-1',
        verfahrenId: 'verfahren-1',
      }),
    );

    act(() => {
      result.current.onRefresh();
    });

    expect(mocks.isHandledProjectVersionConflictErrorMock).toHaveBeenCalledWith(
      conflictError,
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(mocks.toastMock.error).not.toHaveBeenCalled();
  });

  it('reports ordinary workflow-start errors to Sentry and toast', () => {
    const ordinaryError = new Error('ordinary failure');
    mocks.isHandledProjectVersionConflictErrorMock.mockReturnValue(false);
    mocks.mutateMock.mockImplementation((_variables, callbacks) => {
      callbacks.onError(ordinaryError);
    });
    const { result } = renderHook(() =>
      useRpbBewertungRefreshAction({
        canMutateTopic: true,
        normId: 'norm-1',
        verfahrenId: 'verfahren-1',
      }),
    );

    act(() => {
      result.current.onRefresh();
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(ordinaryError);
    expect(mocks.toastMock.error).toHaveBeenCalledWith(
      'The AI analysis could not be started.',
    );
  });

  it('keeps refresh disabled while running-workflow state is loading', () => {
    mocks.workflowStates = [
      { isLoading: true, isRunning: false },
      { isLoading: false, isRunning: false },
    ];

    const { result } = renderHook(() =>
      useRpbBewertungRefreshAction({
        canMutateTopic: true,
        normId: 'norm-1',
        verfahrenId: 'verfahren-1',
      }),
    );

    expect(result.current.isWorkflowStatusLoading).toBe(true);
    expect(result.current.isRefreshDisabled).toBe(true);

    act(() => {
      result.current.onRefresh();
    });

    expect(mocks.mutateMock).not.toHaveBeenCalled();
  });
});
