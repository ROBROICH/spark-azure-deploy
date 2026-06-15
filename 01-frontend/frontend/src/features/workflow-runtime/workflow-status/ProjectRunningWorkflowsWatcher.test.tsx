import type { WorkflowsBase } from '@/api-clients/temporal-jobs-module/types.gen';
import type { useLiveQuery } from '@tanstack/react-db';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectRunningWorkflowsWatcher } from './ProjectRunningWorkflowsWatcher';

const testState = vi.hoisted(() => ({
  isError: false,
  isLoading: false,
  runningWorkflows: [] as WorkflowsBase[],
  getRunningCollection: vi.fn(() => ({ id: 'running-workflows' })),
  reconcileRunningWorkflows: vi.fn(() => false),
  refetchNodeSummaries: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useLoaderData: () => ({
      refetchNodeSummaries: testState.refetchNodeSummaries,
      workflowsManager: {
        getRunningCollection: testState.getRunningCollection,
        reconcileRunningWorkflows: testState.reconcileRunningWorkflows,
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
      isError: testState.isError,
      isLoading: testState.isLoading,
    }),
  };
});

const createWorkflow = (workflowId: string): WorkflowsBase => ({
  run_id: `run-${workflowId}`,
  status: 'running',
  workflow_id: workflowId,
  workflow_start_time: '2026-05-19T00:00:00.000Z',
  workflow_type: 'workflow-a',
});

describe('ProjectRunningWorkflowsWatcher', () => {
  beforeEach(() => {
    testState.isError = false;
    testState.isLoading = false;
    testState.runningWorkflows = [];
    testState.getRunningCollection.mockClear();
    testState.reconcileRunningWorkflows.mockReset();
    testState.reconcileRunningWorkflows.mockReturnValue(false);
    testState.refetchNodeSummaries.mockReset();
    testState.refetchNodeSummaries.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('passes running workflow snapshots to the workflow manager', () => {
    const runningWorkflow = createWorkflow('workflow-1');
    testState.runningWorkflows = [runningWorkflow];

    render(<ProjectRunningWorkflowsWatcher />);

    expect(testState.getRunningCollection).toHaveBeenCalledOnce();
    expect(testState.reconcileRunningWorkflows).toHaveBeenCalledWith([
      runningWorkflow,
    ]);
    expect(testState.refetchNodeSummaries).not.toHaveBeenCalled();
  });

  it('coalesces summary refreshes after observed workflows disappear', async () => {
    vi.useFakeTimers();
    testState.reconcileRunningWorkflows.mockReturnValue(true);

    const { rerender } = render(<ProjectRunningWorkflowsWatcher />);
    testState.runningWorkflows = [createWorkflow('workflow-2')];
    rerender(<ProjectRunningWorkflowsWatcher />);

    expect(testState.refetchNodeSummaries).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(3_999);
      await Promise.resolve();
    });

    expect(testState.refetchNodeSummaries).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(testState.refetchNodeSummaries).toHaveBeenCalledOnce();
  });

  it('clears a scheduled summary refresh when the watcher unmounts', async () => {
    vi.useFakeTimers();
    testState.reconcileRunningWorkflows.mockReturnValue(true);

    const { unmount } = render(<ProjectRunningWorkflowsWatcher />);

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
    });

    expect(testState.refetchNodeSummaries).not.toHaveBeenCalled();
  });

  it('does not reconcile while the running workflow collection is loading', () => {
    testState.isLoading = true;

    render(<ProjectRunningWorkflowsWatcher />);

    expect(testState.reconcileRunningWorkflows).not.toHaveBeenCalled();
  });
});
