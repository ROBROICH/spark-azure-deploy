import type { WorkflowsBase } from '@/api-clients/temporal-jobs-module/types.gen';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProjectTemporalWorkflowsManager } from './projectTemporalWorkflows.collection';

const apiMocks = vi.hoisted(() => ({
  getWorkflowTemporalWorkflowsWorkflowIdGet: vi.fn(),
  getWorkflowsByTypeTemporalWorkflowsProjectIdByTypeGet: vi.fn(() =>
    Promise.resolve({ data: { workflows: [] } }),
  ),
  getWorkflowsTemporalWorkflowsGet: vi.fn(() =>
    Promise.resolve({ data: { workflows: [] } }),
  ),
}));

vi.mock('@/api-clients/temporal-jobs-module', () => ({
  getWorkflowTemporalWorkflowsWorkflowIdGet:
    apiMocks.getWorkflowTemporalWorkflowsWorkflowIdGet,
  getWorkflowsByTypeTemporalWorkflowsProjectIdByTypeGet:
    apiMocks.getWorkflowsByTypeTemporalWorkflowsProjectIdByTypeGet,
  getWorkflowsTemporalWorkflowsGet: apiMocks.getWorkflowsTemporalWorkflowsGet,
}));

const createWorkflow = (workflowId: string): WorkflowsBase => ({
  run_id: `run-${workflowId}`,
  status: 'running',
  workflow_id: workflowId,
  workflow_start_time: '2026-05-19T00:00:00.000Z',
  workflow_type: 'workflow-a',
});

describe('project temporal workflows manager running observations', () => {
  afterEach(() => {
    vi.useRealTimers();
    apiMocks.getWorkflowTemporalWorkflowsWorkflowIdGet.mockClear();
    apiMocks.getWorkflowsByTypeTemporalWorkflowsProjectIdByTypeGet.mockClear();
    apiMocks.getWorkflowsTemporalWorkflowsGet.mockClear();
  });

  it('requests a summary refresh when a previously running workflow disappears', () => {
    const manager = getProjectTemporalWorkflowsManager(
      'running-observation-project',
      1,
    );

    expect(
      manager.reconcileRunningWorkflows([createWorkflow('workflow-1')]),
    ).toBe(false);

    expect(manager.reconcileRunningWorkflows([])).toBe(true);
    expect(manager.reconcileRunningWorkflows([])).toBe(false);
  });

  it('keeps a false summary-refresh option when the same workflow is observed again', () => {
    const manager = getProjectTemporalWorkflowsManager(
      'running-observation-project-disabled',
      1,
    );

    manager.observeRunningWorkflow('workflow-1', {
      refetchNodeSummariesOnSuccess: false,
    });
    expect(
      manager.reconcileRunningWorkflows([createWorkflow('workflow-1')]),
    ).toBe(false);
    expect(manager.reconcileRunningWorkflows([])).toBe(false);
  });

  it('does not notify subscribers when the running workflow observation is unchanged', () => {
    const manager = getProjectTemporalWorkflowsManager(
      'running-observation-project-unchanged',
      1,
    );
    const listener = vi.fn();

    manager.subscribeRunningWorkflowObservations(listener);
    manager.observeRunningWorkflow('workflow-1', {
      workflowType: 'workflow-a',
    });
    manager.observeRunningWorkflow('workflow-1', {
      workflowType: 'workflow-a',
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps newly started workflows optimistic until the discovery grace expires', () => {
    vi.useFakeTimers();
    const manager = getProjectTemporalWorkflowsManager(
      'running-observation-project-started',
      1,
    );

    void manager.observeStartedWorkflow('workflow-1', {
      workflowType: 'workflow-a',
    });
    expect(manager.getRunningWorkflowObservations()).toHaveLength(1);

    expect(manager.reconcileRunningWorkflows([])).toBe(false);
    expect(manager.getRunningWorkflowObservations()).toHaveLength(1);

    vi.advanceTimersByTime(10_000);

    expect(manager.reconcileRunningWorkflows([])).toBe(true);
    expect(manager.getRunningWorkflowObservations()).toHaveLength(0);
  });
});
