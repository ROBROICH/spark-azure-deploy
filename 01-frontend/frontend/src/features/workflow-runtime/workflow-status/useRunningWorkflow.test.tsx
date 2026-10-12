import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import type { useLiveQuery } from '@tanstack/react-db';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRunningWorkflow } from './useRunningWorkflow';

const testState = vi.hoisted(() => ({
  getRunningWorkflowObservationsMock: vi.fn(() => [] as WorkflowsBase[]),
  observeStartedWorkflowMock: vi.fn(),
  observeRunningWorkflowMock: vi.fn(),
  runningWorkflows: [] as WorkflowsBase[],
  getCollectionMock: vi.fn(() => ({})),
  subscribeRunningWorkflowObservationsMock: vi.fn(() => vi.fn()),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useLoaderData: () => ({
      workflowsManager: {
        getCollection: testState.getCollectionMock,
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

describe('useRunningWorkflow', () => {
  beforeEach(() => {
    testState.observeRunningWorkflowMock.mockClear();
    testState.observeStartedWorkflowMock.mockClear();
    testState.getCollectionMock.mockClear();
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
        workflowId: 'api-prefix-verfahren-1-norm-1',
        workflowType: 'suche_zuordnung_norm',
      }),
      createWorkflow({
        status: 'running',
        workflowId: 'api-prefix-verfahren-1-norm-2',
        workflowType: 'suche_zuordnung_norm',
      }),
    ];

    const { result } = renderHook(() =>
      useRunningWorkflow({
        workflowType: 'suche_zuordnung_norm',
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
      }),
    );

    expect(result.current.isRunning).toBe(true);
    expect(result.current.latestRunningWorkflow?.workflowId).toBe(
      'api-prefix-verfahren-1-norm-1',
    );
  });

  it('ignores completed workflows even if the backing collection is stale', () => {
    testState.runningWorkflows = [
      createWorkflow({
        status: 'completed',
        workflowId: 'api-prefix-verfahren-1-norm-1',
        workflowType: 'suche_zuordnung_norm',
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
  });

  it('reports optimistic started workflows as running', () => {
    testState.getRunningWorkflowObservationsMock.mockReturnValue([
      createWorkflow({
        status: 'running',
        workflowId: 'api-prefix-verfahren-1-norm-1',
        workflowType: 'suche_zuordnung_norm',
      }),
    ]);

    const { result } = renderHook(() =>
      useRunningWorkflow({
        workflowType: 'suche_zuordnung_norm',
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
      }),
    );

    expect(result.current.isRunning).toBe(true);
    expect(result.current.latestRunningWorkflow?.workflowId).toBe(
      'api-prefix-verfahren-1-norm-1',
    );
  });

  it('lists each confirmed and observed running workflow id once, sorted', () => {
    testState.runningWorkflows = [
      createWorkflow({
        status: 'running',
        workflowId: 'api-prefix-verfahren-1-norm-2',
        workflowType: 'suche_zuordnung_norm',
      }),
    ];
    testState.getRunningWorkflowObservationsMock.mockReturnValue([
      createWorkflow({
        status: 'running',
        workflowId: 'api-prefix-verfahren-1-norm-2',
        workflowType: 'suche_zuordnung_norm',
      }),
      createWorkflow({
        status: 'running',
        workflowId: 'api-prefix-verfahren-1-norm-1',
        workflowType: 'suche_zuordnung_norm',
      }),
    ]);

    const { result } = renderHook(() =>
      useRunningWorkflow({ workflowType: 'suche_zuordnung_norm' }),
    );

    expect(result.current.runningWorkflowIds).toEqual([
      'api-prefix-verfahren-1-norm-1',
      'api-prefix-verfahren-1-norm-2',
    ]);
  });
});
