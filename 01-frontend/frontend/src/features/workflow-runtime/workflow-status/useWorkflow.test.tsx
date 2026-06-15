import type { WorkflowsBase } from '@/api-clients/temporal-jobs-module/types.gen';
import type { useLiveQuery } from '@tanstack/react-db';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkflow } from './useWorkflow';

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
  overrides: Pick<WorkflowsBase, 'workflow_id' | 'workflow_type' | 'status'> &
    Partial<WorkflowsBase>,
): WorkflowsBase => ({
  run_id: 'run-id',
  workflow_start_time: '2026-04-09T00:00:00.000Z',
  ...overrides,
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
    vi.useRealTimers();
  });

  it('matches workflow type and the API id without its opaque prefix', () => {
    testState.workflows = [
      createWorkflow({
        status: 'running',
        workflow_id: 'api-prefix-verfahren-1-norm-1',
        workflow_type: 'other_workflow',
      }),
      createWorkflow({
        status: 'running',
        workflow_id: 'api-prefix-verfahren-1-norm-1',
        workflow_type: 'suche_zuordnung_norm',
      }),
    ];

    const { result } = renderHook(() =>
      useWorkflow({
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
        workflowType: 'suche_zuordnung_norm',
      }),
    );

    expect(result.current).toMatchObject({
      isDone: false,
      isError: false,
      isFailed: false,
      isLoading: false,
      isRunning: true,
      hasAnyRun: true,
    });
    expect(testState.getCollectionMock).toHaveBeenCalledWith({
      workflowType: 'suche_zuordnung_norm',
    });
  });

  it('does not match when only the id suffix matches', () => {
    testState.workflows = [
      createWorkflow({
        status: 'running',
        workflow_id: 'api-prefix-verfahren-1-norm-1',
        workflow_type: 'other_workflow',
      }),
    ];

    const { result } = renderHook(() =>
      useWorkflow({
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
        workflowType: 'suche_zuordnung_norm',
      }),
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
        workflow_id: 'api-prefix-existing-run-verfahren-1-norm-1',
        workflow_type: 'BewertungOrchestratorWorkflow',
      }),
    ];

    const { result } = renderHook(() =>
      useWorkflow({
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
        workflowType: ['bewertung', 'BewertungOrchestratorWorkflow'],
      }),
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
    expect(testState.getCollectionMock).toHaveBeenCalledWith({
      workflowType: ['bewertung', 'BewertungOrchestratorWorkflow'],
    });
  });

  it('matches workflow ids with the project version segment after the project id', () => {
    testState.workflows = [
      createWorkflow({
        status: 'running',
        workflow_id: 'api-prefix-verfahren-1-v7-norm-1',
        workflow_type: 'suche_zuordnung_norm',
      }),
    ];

    const { result } = renderHook(() =>
      useWorkflow({
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
        workflowType: 'suche_zuordnung_norm',
      }),
    );

    expect(result.current).toMatchObject({
      isRunning: true,
      hasAnyRun: true,
    });
    expect(testState.observeRunningWorkflowMock).toHaveBeenCalledWith(
      'api-prefix-verfahren-1-v7-norm-1',
      {
        refetchNodeSummariesOnSuccess: true,
        workflowType: 'suche_zuordnung_norm',
      },
    );
  });

  it('groups all workflow runs by type and marks the group pending when any run is still active', () => {
    testState.workflows = [
      createWorkflow({
        run_id: 'older-run',
        status: 'running',
        workflow_id: 'workflow-a-older',
        workflow_start_time: '2026-04-09T00:00:00.000Z',
        workflow_type: 'workflow-a',
      }),
      createWorkflow({
        run_id: 'newer-run',
        status: 'completed',
        workflow_id: 'workflow-a-newer',
        workflow_start_time: '2026-04-10T00:00:00.000Z',
        workflow_type: 'workflow-a',
      }),
    ];

    const { result } = renderHook(() => useWorkflow());

    expect(result.current.latestWorkflowsByType).toHaveLength(1);
    expect(result.current.latestWorkflowsByType[0]).toMatchObject({
      badgeStatus: 'pending',
      isRunning: true,
      workflow: {
        workflow_id: 'workflow-a-newer',
      },
      workflows: [
        {
          workflow_id: 'workflow-a-newer',
        },
        {
          workflow_id: 'workflow-a-older',
        },
      ],
      workflowTypeKey: 'workflow-a',
    });
  });

  it('exposes the initial workflow collection loading state', () => {
    testState.isLoading = true;

    const { result } = renderHook(() =>
      useWorkflow({
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
        workflowType: 'suche_zuordnung_norm',
      }),
    );

    expect(result.current).toMatchObject({
      isDone: false,
      isError: false,
      isFailed: false,
      isLoading: true,
      isRunning: false,
    });
  });

  it('requests a child-inclusive collection when sub workflows are needed', () => {
    renderHook(() =>
      useWorkflow({
        workflowType: 'fvpworkflow',
        includeSubWorkflows: true,
      }),
    );

    expect(testState.getCollectionMock).toHaveBeenCalledWith({
      workflowType: 'fvpworkflow',
      includeChildren: true,
    });
  });

  it('refetches history when a matching running workflow is already active on mount', () => {
    testState.workflows = [
      createWorkflow({
        status: 'running',
        workflow_id: 'workflow-run',
        workflow_type: 'workflow-a',
      }),
    ];

    renderHook(() =>
      useWorkflow({
        workflowType: 'workflow-a',
      }),
    );

    expect(testState.refetchWorkflowsMock).toHaveBeenCalledOnce();
    expect(testState.refetchWorkflowsMock).toHaveBeenCalledWith({
      workflowType: 'workflow-a',
    });
  });

  it('refetches history when a matching running workflow starts and settles', () => {
    const { rerender } = renderHook(() =>
      useWorkflow({
        workflowType: 'workflow-a',
      }),
    );

    expect(testState.refetchWorkflowsMock).not.toHaveBeenCalled();

    testState.workflows = [
      createWorkflow({
        status: 'running',
        workflow_id: 'workflow-run',
        workflow_type: 'workflow-a',
      }),
    ];
    rerender();

    expect(testState.refetchWorkflowsMock).toHaveBeenCalledTimes(1);

    testState.workflows = [
      createWorkflow({
        status: 'completed',
        workflow_id: 'workflow-run',
        workflow_type: 'workflow-a',
      }),
    ];
    rerender();

    expect(testState.refetchWorkflowsMock).toHaveBeenCalledTimes(2);
  });

  it('delays the success callback while keeping the workflow loading', async () => {
    vi.useFakeTimers();
    const onLatestWorkflowSucceeded = vi.fn();
    testState.workflows = [
      createWorkflow({
        status: 'running',
        workflow_id: 'workflow-run',
        workflow_type: 'workflow-a',
      }),
    ];

    const { rerender, result } = renderHook(() =>
      useWorkflow({
        workflowType: 'workflow-a',
        onLatestWorkflowSucceeded,
      }),
    );

    testState.workflows = [
      createWorkflow({
        status: 'completed',
        workflow_id: 'workflow-run',
        workflow_type: 'workflow-a',
      }),
    ];
    rerender();

    expect(onLatestWorkflowSucceeded).not.toHaveBeenCalled();
    expect(testState.refetchNodeSummariesMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(3_999);
      await Promise.resolve();
    });

    expect(onLatestWorkflowSucceeded).not.toHaveBeenCalled();
    expect(testState.refetchNodeSummariesMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(testState.refetchNodeSummariesMock).not.toHaveBeenCalled();
    expect(onLatestWorkflowSucceeded).toHaveBeenCalledOnce();
    expect(onLatestWorkflowSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow_id: 'workflow-run',
      }),
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('skips the delayed loading bridge when summary refresh and callback are absent', () => {
    vi.useFakeTimers();
    testState.workflows = [
      createWorkflow({
        status: 'running',
        workflow_id: 'workflow-run',
        workflow_type: 'workflow-a',
      }),
    ];

    const { rerender, result } = renderHook(() =>
      useWorkflow({
        workflowType: 'workflow-a',
        refetchNodeSummariesOnSuccess: false,
      }),
    );

    testState.workflows = [
      createWorkflow({
        status: 'completed',
        workflow_id: 'workflow-run',
        workflow_type: 'workflow-a',
      }),
    ];
    rerender();

    expect(result.current.isLoading).toBe(false);

    act(() => {
      vi.advanceTimersByTime(4_000);
    });

    expect(testState.refetchNodeSummariesMock).not.toHaveBeenCalled();
  });

  it('does not call the success callback when the pending run fails', () => {
    const onLatestWorkflowSucceeded = vi.fn();
    testState.workflows = [
      createWorkflow({
        status: 'running',
        workflow_id: 'workflow-run',
        workflow_type: 'workflow-a',
      }),
    ];

    const { rerender } = renderHook(() =>
      useWorkflow({
        workflowType: 'workflow-a',
        onLatestWorkflowSucceeded,
      }),
    );

    testState.workflows = [
      createWorkflow({
        status: 'failed',
        workflow_id: 'workflow-run',
        workflow_type: 'workflow-a',
      }),
    ];
    rerender();

    expect(onLatestWorkflowSucceeded).not.toHaveBeenCalled();
  });
});
