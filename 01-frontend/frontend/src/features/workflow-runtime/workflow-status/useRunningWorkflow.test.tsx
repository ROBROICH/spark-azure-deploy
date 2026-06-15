import type { WorkflowsBase } from '@/api-clients/temporal-jobs-module/types.gen';
import type { useLiveQuery } from '@tanstack/react-db';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRunningWorkflow } from './useRunningWorkflow';

const testState = vi.hoisted(() => ({
  getRunningWorkflowObservationsMock: vi.fn(() => [] as WorkflowsBase[]),
  observeStartedWorkflowMock: vi.fn(),
  observeRunningWorkflowMock: vi.fn(),
  runningWorkflows: [] as WorkflowsBase[],
  getRunningCollectionMock: vi.fn(() => ({})),
  subscribeRunningWorkflowObservationsMock: vi.fn(() => vi.fn()),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useLoaderData: () => ({
      workflowsManager: {
        getRunningCollection: testState.getRunningCollectionMock,
        getRunningWorkflowObservations:
          testState.getRunningWorkflowObservationsMock,
        observeStartedWorkflow: testState.observeStartedWorkflowMock,
        observeRunningWorkflow: testState.observeRunningWorkflowMock,
        subscribeRunningWorkflowObservations:
          testState.subscribeRunningWorkflowObservationsMock,
      },
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
      data: testState.runningWorkflows,
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

describe('useRunningWorkflow', () => {
  beforeEach(() => {
    testState.observeRunningWorkflowMock.mockClear();
    testState.observeStartedWorkflowMock.mockClear();
    testState.getRunningCollectionMock.mockClear();
    testState.getRunningWorkflowObservationsMock.mockClear();
    testState.getRunningWorkflowObservationsMock.mockReturnValue([]);
    testState.subscribeRunningWorkflowObservationsMock.mockClear();
    testState.runningWorkflows = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('matches running workflows by type and workflow id segments', () => {
    testState.runningWorkflows = [
      createWorkflow({
        status: 'running',
        workflow_id: 'api-prefix-verfahren-1-norm-1',
        workflow_type: 'suche_zuordnung_norm',
      }),
      createWorkflow({
        status: 'running',
        workflow_id: 'api-prefix-verfahren-1-norm-2',
        workflow_type: 'suche_zuordnung_norm',
      }),
    ];

    const { result } = renderHook(() =>
      useRunningWorkflow({
        workflowType: 'suche_zuordnung_norm',
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
      }),
    );

    expect(result.current.isRunning).toBe(true);
    expect(result.current.latestRunningWorkflow?.workflow_id).toBe(
      'api-prefix-verfahren-1-norm-1',
    );
    expect(testState.observeRunningWorkflowMock).toHaveBeenCalledWith(
      'api-prefix-verfahren-1-norm-1',
      {
        refetchNodeSummariesOnSuccess: true,
        workflowType: 'suche_zuordnung_norm',
      },
    );
  });

  it('ignores completed workflows even if the backing collection is stale', () => {
    testState.runningWorkflows = [
      createWorkflow({
        status: 'completed',
        workflow_id: 'api-prefix-verfahren-1-norm-1',
        workflow_type: 'suche_zuordnung_norm',
      }),
    ];

    const { result } = renderHook(() =>
      useRunningWorkflow({
        workflowType: 'suche_zuordnung_norm',
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
      }),
    );

    expect(result.current.isRunning).toBe(false);
    expect(result.current.latestRunningWorkflow).toBeUndefined();
    expect(testState.observeRunningWorkflowMock).not.toHaveBeenCalled();
  });

  it('reports optimistic started workflows as running', () => {
    testState.getRunningWorkflowObservationsMock.mockReturnValue([
      createWorkflow({
        status: 'running',
        workflow_id: 'api-prefix-verfahren-1-norm-1',
        workflow_type: 'suche_zuordnung_norm',
      }),
    ]);

    const { result } = renderHook(() =>
      useRunningWorkflow({
        workflowType: 'suche_zuordnung_norm',
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
      }),
    );

    expect(result.current.isRunning).toBe(true);
    expect(result.current.latestRunningWorkflow?.workflow_id).toBe(
      'api-prefix-verfahren-1-norm-1',
    );
  });

  it('observes started workflows and refetches the running collection through the manager', () => {
    const { result } = renderHook(() =>
      useRunningWorkflow({
        workflowType: 'suche_zuordnung_norm',
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
        refetchNodeSummariesOnSuccess: false,
      }),
    );

    result.current.observeStarted('suz-workflow-norm-1');

    expect(testState.observeStartedWorkflowMock).toHaveBeenCalledWith(
      'suz-workflow-norm-1',
      {
        refetchNodeSummariesOnSuccess: false,
        workflowType: 'suche_zuordnung_norm',
      },
    );
  });
});
