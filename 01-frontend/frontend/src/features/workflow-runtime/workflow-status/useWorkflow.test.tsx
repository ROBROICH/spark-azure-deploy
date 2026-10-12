import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import type { useLiveQuery } from '@tanstack/react-db';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkflow } from './useWorkflow';

const queryClient = new QueryClient();
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const testState = vi.hoisted(() => {
  return {
    isError: false,
    isLoading: false,
    refetchNodeSummariesMock: vi.fn(() => Promise.resolve()),
    routeProjectId: 'verfahren-route',
    routeProjectVersion: 3,
    workflows: [] as WorkflowsBase[],
    getCollectionMock: vi.fn(() => ({
      utils: {
        refetch: vi.fn(() => Promise.resolve()),
      },
    })),
    getRunningCollectionMock: vi.fn(() => ({
      utils: {
        refetch: vi.fn(() => Promise.resolve()),
      },
    })),
    getRunningWorkflowObservationsMock: vi.fn(() => [] as WorkflowsBase[]),
    observeStartedWorkflowMock: vi.fn(),
    observeRunningWorkflowMock: vi.fn(),
    refetchWorkflowsMock: vi.fn(() => Promise.resolve()),
    subscribeRunningWorkflowObservationsMock: vi.fn(() => vi.fn()),
  };
});

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useLoaderData: () => {
      return {
        projectVersion: testState.routeProjectVersion,
        refetchNodeSummaries: testState.refetchNodeSummariesMock,
        workflowsManager: {
          getCollection: testState.getCollectionMock,
          getRunningCollection: testState.getRunningCollectionMock,
          getRunningWorkflowObservations:
            testState.getRunningWorkflowObservationsMock,
          observeStartedWorkflow: testState.observeStartedWorkflowMock,
          observeRunningWorkflow: testState.observeRunningWorkflowMock,
          refetch: testState.refetchWorkflowsMock,
          subscribeRunningWorkflowObservations:
            testState.subscribeRunningWorkflowObservationsMock,
        },
      };
    },
    useParams: () => ({
      verfahrenId: testState.routeProjectId,
    }),
  }),
}));

vi.mock('@tanstack/react-db', async (importOriginal) => {
  const actual = await importOriginal<{
    useLiveQuery: typeof useLiveQuery;
  }>();

  return {
    ...actual,
    useLiveQuery: () => ({
      data: testState.workflows,
      isError: testState.isError,
      isLoading: testState.isLoading,
    }),
  };
});

const createWorkflow = (
  overrides: Pick<WorkflowsBase, 'workflowId' | 'workflowType' | 'status'> &
    Partial<WorkflowsBase>,
): WorkflowsBase => ({
  workflowId: overrides.workflowId,
  workflowType: overrides.workflowType,
  status: overrides.status,
  runId: overrides.runId ?? 'run-id',
  workflowStartTime: overrides.workflowStartTime ?? '2026-04-09T00:00:00.000Z',
  workflowCloseTime: overrides.workflowCloseTime ?? null,
  projectId: overrides.projectId ?? null,
  projectVersion: overrides.projectVersion ?? null,
  failure: overrides.failure ?? null,
});

describe('useWorkflow', () => {
  beforeEach(() => {
    testState.isError = false;
    testState.isLoading = false;
    testState.routeProjectId = 'verfahren-route';
    testState.routeProjectVersion = 3;
    testState.workflows = [];
    testState.getCollectionMock.mockClear();
    testState.getRunningCollectionMock.mockClear();
    testState.getRunningWorkflowObservationsMock.mockClear();
    testState.getRunningWorkflowObservationsMock.mockReturnValue([]);
    testState.refetchNodeSummariesMock.mockClear();
    testState.observeStartedWorkflowMock.mockClear();
    testState.observeRunningWorkflowMock.mockClear();
    testState.refetchWorkflowsMock.mockClear();
    testState.subscribeRunningWorkflowObservationsMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    vi.useRealTimers();
  });

  it('matches workflow type and the API id without its opaque prefix', () => {
    testState.workflows = [
      createWorkflow({
        status: 'running',
        workflowId: 'api-prefix-verfahren-1-norm-1',
        workflowType: 'other_workflow',
      }),
      createWorkflow({
        status: 'running',
        workflowId: 'api-prefix-verfahren-1-norm-1',
        workflowType: 'suche_zuordnung_norm',
      }),
    ];

    const { result } = renderHook(
      () =>
        useWorkflow({
          matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
          workflowType: 'suche_zuordnung_norm',
        }),
      { wrapper },
    );

    expect(result.current).toMatchObject({
      isDone: false,
      isError: false,
      isFailed: false,
      isLoading: false,
      isRunning: true,
      hasAnyRun: true,
    });
  });

  it('does not match when only the id suffix matches', () => {
    testState.workflows = [
      createWorkflow({
        status: 'running',
        workflowId: 'api-prefix-verfahren-1-norm-1',
        workflowType: 'other_workflow',
      }),
    ];

    const { result } = renderHook(
      () =>
        useWorkflow({
          matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
          workflowType: 'suche_zuordnung_norm',
        }),
      { wrapper },
    );

    expect(result.current).toMatchObject({
      isDone: false,
      isError: false,
      isFailed: false,
      isLoading: false,
      isRunning: false,
      hasAnyRun: false,
    });
  });

  it('matches completed workflows when a Bewertung alias and a longer id suffix are used', () => {
    testState.workflows = [
      createWorkflow({
        status: 'completed',
        workflowId: 'api-prefix-existing-run-verfahren-1-norm-1',
        workflowType: 'BewertungOrchestratorWorkflow',
      }),
    ];

    const { result } = renderHook(
      () =>
        useWorkflow({
          matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
          workflowType: ['bewertung', 'BewertungOrchestratorWorkflow'],
        }),
      { wrapper },
    );

    expect(result.current).toMatchObject({
      isDone: true,
      isError: false,
      isFailed: false,
      isLoading: false,
      isRunning: false,
      hasAnyRun: true,
      hasSuccessfulRun: true,
    });
  });

  it('matches workflow ids with the project version segment after the project id', () => {
    testState.workflows = [
      createWorkflow({
        status: 'running',
        workflowId: 'api-prefix-verfahren-1-v7-norm-1',
        workflowType: 'suche_zuordnung_norm',
      }),
    ];

    const { result } = renderHook(
      () =>
        useWorkflow({
          matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
          workflowType: 'suche_zuordnung_norm',
        }),
      { wrapper },
    );

    expect(result.current).toMatchObject({
      isRunning: true,
      hasAnyRun: true,
    });
  });

  it('groups all workflow runs by type and marks the group pending when any run is still active', () => {
    testState.workflows = [
      createWorkflow({
        runId: 'older-run',
        status: 'running',
        workflowId: 'workflow-a-older',
        workflowStartTime: '2026-04-09T00:00:00.000Z',
        workflowType: 'workflow-a',
      }),
      createWorkflow({
        runId: 'newer-run',
        status: 'completed',
        workflowId: 'workflow-a-newer',
        workflowStartTime: '2026-04-10T00:00:00.000Z',
        workflowType: 'workflow-a',
      }),
    ];

    const { result } = renderHook(() => useWorkflow(), { wrapper });

    expect(result.current.latestWorkflowsByType).toHaveLength(1);
    expect(result.current.latestWorkflowsByType[0]).toMatchObject({
      badgeStatus: 'pending',
      isRunning: true,
      workflow: {
        workflowId: 'workflow-a-newer',
      },
      workflows: [
        {
          workflowId: 'workflow-a-newer',
        },
        {
          workflowId: 'workflow-a-older',
        },
      ],
      workflowTypeKey: 'workflow-a',
    });
  });

  it('keeps completion pending until the feature callback finishes', async () => {
    let finish: () => void;
    const completion = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const onLatestWorkflowSucceeded = vi.fn(() => completion);
    testState.workflows = [
      createWorkflow({
        status: 'running',
        workflowId: 'workflow-run',
        workflowType: 'workflow-a',
      }),
    ];
    const { rerender, result } = renderHook(
      () =>
        useWorkflow({ workflowType: 'workflow-a', onLatestWorkflowSucceeded }),
      { wrapper },
    );
    testState.workflows = [
      createWorkflow({
        status: 'completed',
        workflowId: 'workflow-run',
        workflowType: 'workflow-a',
      }),
    ];
    rerender();
    await waitFor(() =>
      expect(onLatestWorkflowSucceeded).toHaveBeenCalledOnce(),
    );
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      finish();
      await completion;
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender();
    expect(onLatestWorkflowSucceeded).toHaveBeenCalledOnce();
  });

  it('reports the failure of a failed latest run and none after a later successful run', () => {
    const failure = {
      errorCode: 'ANALYSIS_FAILED' as const,
      branches: [
        {
          branch: 'formalpruefung',
          errorCode: 'ANALYSIS_TIMED_OUT' as const,
        },
      ],
    };
    const failedRun = createWorkflow({
      status: 'failed',
      workflowId: 'fvp-failed',
      workflowType: 'FVPWorkflow',
      workflowStartTime: '2026-04-09T00:00:00.000Z',
      failure,
    });
    testState.workflows = [failedRun];

    const { result, rerender } = renderHook(
      () => useWorkflow({ workflowType: 'FVPWorkflow' }),
      { wrapper },
    );

    expect(result.current.latestFailure).toEqual(failure);

    testState.workflows = [
      failedRun,
      createWorkflow({
        status: 'completed',
        workflowId: 'fvp-completed',
        workflowType: 'FVPWorkflow',
        workflowStartTime: '2026-04-10T00:00:00.000Z',
      }),
    ];
    rerender();

    expect(result.current.latestFailure).toBeNull();
  });

  it('reports no failure while a new matching run is active', () => {
    testState.workflows = [
      createWorkflow({
        status: 'failed',
        workflowId: 'fvp-failed',
        workflowType: 'FVPWorkflow',
      }),
    ];
    testState.getRunningWorkflowObservationsMock.mockReturnValue([
      createWorkflow({
        status: 'running',
        workflowId: 'fvp-restarted',
        workflowType: 'FVPWorkflow',
      }),
    ]);

    const { result } = renderHook(
      () => useWorkflow({ workflowType: 'FVPWorkflow' }),
      { wrapper },
    );

    expect(result.current.isRunning).toBe(true);
    expect(result.current.latestFailure).toBeNull();
  });

  it('does not call the success callback when the pending run fails', () => {
    const onLatestWorkflowSucceeded = vi.fn();
    testState.workflows = [
      createWorkflow({
        status: 'running',
        workflowId: 'workflow-run',
        workflowType: 'workflow-a',
      }),
    ];

    const { rerender } = renderHook(
      () =>
        useWorkflow({
          workflowType: 'workflow-a',
          onLatestWorkflowSucceeded,
        }),
      { wrapper },
    );

    testState.workflows = [
      createWorkflow({
        status: 'failed',
        workflowId: 'workflow-run',
        workflowType: 'workflow-a',
      }),
    ];
    rerender();

    expect(onLatestWorkflowSucceeded).not.toHaveBeenCalled();
  });
});
