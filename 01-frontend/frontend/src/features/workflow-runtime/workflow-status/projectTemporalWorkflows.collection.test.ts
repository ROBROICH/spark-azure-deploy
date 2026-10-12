import { client } from '@/api-clients/backend/client.gen';
import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProjectTemporalWorkflowsManager } from './projectTemporalWorkflows.collection';

const originalClient = client.getConfig();
const running: WorkflowsBase = {
  runId: '62000000-0000-4000-8000-000000000011',
  status: 'running',
  workflowId: 'workflow-1',
  workflowStartTime: '2026-09-01T08:00:00.000Z',
  workflowCloseTime: null,
  workflowType: 'workflow-a',
  projectId: null,
  projectVersion: null,
  failure: null,
};
const runningStatus = { ...running, result: null };
const closedStatus = {
  ...runningStatus,
  status: 'completed' as const,
  workflowCloseTime: '2026-09-01T08:01:00.000Z',
};

beforeEach(() =>
  client.setConfig({
    baseUrl: 'http://temporal-observations.test',
    fetch: () => Promise.resolve(Response.json(runningStatus)),
  }),
);
afterEach(() => {
  client.setConfig(originalClient);
});

describe('project temporal workflows manager running observations', () => {
  it('requests one summary refresh when native status confirms a running workflow completed', () => {
    const manager = getProjectTemporalWorkflowsManager(
      '62000000-0000-4000-8000-000000000012',
      1,
    );
    expect(manager.reconcileRunningWorkflows([runningStatus])).toBe(false);
    expect(manager.reconcileRunningWorkflows([closedStatus])).toBe(true);
    expect(manager.reconcileRunningWorkflows([closedStatus])).toBe(false);
  });

  it('preserves explicit suppression of summary refresh across repeated running observations', () => {
    const manager = getProjectTemporalWorkflowsManager(
      '62000000-0000-4000-8000-000000000013',
      1,
    );
    manager.observeRunningWorkflow(running.workflowId, {
      refetchNodeSummariesOnSuccess: false,
    });
    expect(manager.reconcileRunningWorkflows([runningStatus])).toBe(false);
    expect(manager.reconcileRunningWorkflows([closedStatus])).toBe(false);
  });

  it('requests a summary refresh when a running observer and a history read observe the same run', () => {
    const manager = getProjectTemporalWorkflowsManager(
      '62000000-0000-4000-8000-000000000031',
      1,
    );
    // A running-state read and a history read of the same run both register
    // with their default options; neither may disable the summary refresh.
    manager.observeRunningWorkflow(running.workflowId, {
      workflowType: 'workflow-a',
    });
    manager.observeRunningWorkflow(running.workflowId, {});
    expect(manager.reconcileRunningWorkflows([runningStatus])).toBe(false);
    expect(manager.reconcileRunningWorkflows([closedStatus])).toBe(true);
  });

  it('does not notify subscribers again for an unchanged running observation', () => {
    const manager = getProjectTemporalWorkflowsManager(
      '62000000-0000-4000-8000-000000000014',
      1,
    );
    const listener = vi.fn();
    manager.subscribeRunningWorkflowObservations(listener);
    manager.observeRunningWorkflow(running.workflowId, {
      workflowType: running.workflowType,
    });
    manager.observeRunningWorkflow(running.workflowId, {
      workflowType: running.workflowType,
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('releases a newly started workflow when a native closed run is observed before its running visibility', async () => {
    const manager = getProjectTemporalWorkflowsManager(
      '62000000-0000-4000-8000-000000000015',
      1,
    );
    try {
      await manager.observeStartedWorkflow(running.workflowId, {
        workflowType: running.workflowType,
      });
      expect(manager.reconcileRunningWorkflows([])).toBe(false);
      expect(
        manager
          .getRunningWorkflowObservations()
          .map((workflow) => workflow.workflowId),
      ).toContain(running.workflowId);
      const closed: WorkflowsBase = {
        ...running,
        status: 'completed',
        workflowCloseTime: '2026-09-01T08:01:00.000Z',
      };
      expect(manager.reconcileRunningWorkflows([], [closed])).toBe(true);
      expect(manager.getRunningWorkflowObservations()).toEqual([]);
    } finally {
      await manager.getRunningCollection().cleanup();
    }
  });
});
