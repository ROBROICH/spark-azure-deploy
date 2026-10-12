import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import { client } from '@/api-clients/backend/client.gen';
import { describe, expect, it, vi } from 'vitest';
import { getProjectTemporalWorkflowsManager } from './projectTemporalWorkflows.collection';

const projectId = '62000000-0000-4000-8000-000000000001';
const workflowId = `bewertung-${projectId}-v1-62000000-0000-4000-8000-000000000002`;
const completed: WorkflowsBase = {
  workflowId,
  runId: 'completed-target',
  workflowType: 'bewertung',
  projectId,
  projectVersion: 1,
  status: 'completed',
  workflowStartTime: '2026-09-01T08:00:00.000Z',
  workflowCloseTime: '2026-09-01T08:01:00.000Z',
  failure: null,
};
const failed: WorkflowsBase = {
  ...completed,
  runId: 'failed-target',
  status: 'failed',
  workflowStartTime: '2026-09-02T08:00:00.000Z',
  workflowCloseTime: '2026-09-02T08:01:00.000Z',
};
const firstPage: WorkflowsBase[] = Array.from({ length: 100 }, (_, index) => ({
  ...completed,
  workflowId: `other-${index}`,
  runId: `other-run-${index}`,
  status: 'running',
  workflowStartTime: '2026-09-03T08:00:00.000Z',
  workflowCloseTime: null,
}));

describe('Temporal target status reads', () => {
  it('retains an older successful target run without transferring unrelated project history', async () => {
    const original = client.getConfig();
    const transferred: string[] = [];
    client.setConfig({
      baseUrl: 'http://temporal-target.test',
      fetch: (request) => {
        const url = new URL(
          request instanceof Request ? request.url : String(request),
        );
        const targeted = url.searchParams.get('workflowId') === workflowId;
        const status = url.searchParams.get('executionStatus');
        const workflows = !targeted
          ? firstPage
          : status === 'Completed'
            ? [completed]
            : status === 'Running'
              ? []
              : [failed];
        transferred.push(...workflows.map((workflow) => workflow.workflowId));
        return Promise.resolve(
          Response.json({
            workflows,
            retrievedWorkflows: workflows.length,
            nextPageToken: targeted ? null : 'later-page',
          }),
        );
      },
    });
    const manager = getProjectTemporalWorkflowsManager(projectId, 1);
    const collection = manager.getCollection({
      workflowType: 'bewertung',
      workflowId,
    });
    try {
      await collection.preload();
      expect(
        collection.toArray.map((workflow) => workflow.runId).sort(),
      ).toEqual(['completed-target', 'failed-target']);
      expect(new Set(transferred)).toEqual(new Set([workflowId]));
    } finally {
      await collection.cleanup();
      client.setConfig(original);
    }
  });

  it('does not declare an observed running target complete because a global first page omits it', async () => {
    const original = client.getConfig();
    const running: WorkflowsBase = {
      ...completed,
      runId: 'running-target',
      status: 'running',
      workflowCloseTime: null,
    };
    client.setConfig({
      baseUrl: 'http://temporal-observation.test',
      fetch: (request) => {
        const url = new URL(
          request instanceof Request ? request.url : String(request),
        );
        if (url.pathname.endsWith(workflowId)) {
          return Promise.resolve(Response.json({ ...running, result: null }));
        }
        return Promise.resolve(
          Response.json({
            workflows: firstPage,
            retrievedWorkflows: firstPage.length,
            nextPageToken: 'later-page',
          }),
        );
      },
    });
    const manager = getProjectTemporalWorkflowsManager(projectId, 1);
    manager.observeRunningWorkflow(workflowId, { workflowType: 'bewertung' });
    const collection = manager.getRunningCollection();
    try {
      await collection.preload();
      expect(manager.reconcileRunningWorkflows(collection.toArray)).toBe(false);
      expect(
        manager
          .getRunningWorkflowObservations()
          .map((workflow) => workflow.workflowId),
      ).toContain(workflowId);
    } finally {
      await collection.cleanup();
      client.setConfig(original);
    }
  });

  it('does not settle a running workflow from a snapshot fetched before it was observed', async () => {
    const manager = getProjectTemporalWorkflowsManager(
      '62000000-0000-4000-8000-000000000003',
      1,
    );
    const collection = manager.getRunningCollection();
    try {
      await collection.preload();
      const beforeObservation = collection.toArray;
      manager.observeRunningWorkflow(workflowId, { workflowType: 'bewertung' });
      expect(manager.reconcileRunningWorkflows(beforeObservation)).toBe(false);
      expect(
        manager
          .getRunningWorkflowObservations()
          .map((workflow) => workflow.workflowId),
      ).toContain(workflowId);
    } finally {
      await collection.cleanup();
    }
  });

  it('refreshes a mounted running target when it completes without manual invalidation', async () => {
    vi.useFakeTimers();
    const original = client.getConfig();
    const pollingProjectId = '62000000-0000-4000-8000-000000000004';
    const running: WorkflowsBase = {
      ...completed,
      projectId: pollingProjectId,
      workflowId: `bewertung-${pollingProjectId}-v1-62000000-0000-4000-8000-000000000002`,
      status: 'running',
      workflowCloseTime: null,
    };
    let active = true;
    client.setConfig({
      baseUrl: 'http://temporal-live-target.test',
      fetch: () =>
        Promise.resolve(
          Response.json({
            workflows: active ? [running] : [],
            retrievedWorkflows: active ? 1 : 0,
            nextPageToken: null,
          }),
        ),
    });
    const manager = getProjectTemporalWorkflowsManager(pollingProjectId, 1);
    const collection = manager.getCollection({
      workflowType: 'bewertung',
      workflowId: running.workflowId,
      executionStatus: 'Running',
    });
    try {
      await collection.preload();
      expect(collection.toArray.map((workflow) => workflow.workflowId)).toEqual(
        [running.workflowId],
      );
      active = false;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(collection.toArray).toEqual([]);
    } finally {
      await collection.cleanup();
      client.setConfig(original);
      vi.useRealTimers();
    }
  });

  it('settles every fast terminal target even when no running visibility was observed', async () => {
    const original = client.getConfig();
    const fastProjectId = '62000000-0000-4000-8000-000000000005';
    const firstId = `first-${fastProjectId}`;
    const secondId = `second-${fastProjectId}`;
    client.setConfig({
      baseUrl: 'http://temporal-fast-targets.test',
      fetch: (request) => {
        const url = new URL(
          request instanceof Request ? request.url : String(request),
        );
        const id = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
        return Promise.resolve(
          Response.json(
            id === firstId || id === secondId
              ? {
                  ...completed,
                  workflowId: id,
                  runId: `${id}-run`,
                  result: null,
                }
              : { workflows: [], retrievedWorkflows: 0, nextPageToken: null },
          ),
        );
      },
    });
    const manager = getProjectTemporalWorkflowsManager(fastProjectId, 1);
    try {
      await manager.observeStartedWorkflow(firstId, {
        workflowType: 'bewertung',
      });
      await manager.observeStartedWorkflow(secondId, {
        workflowType: 'bewertung',
      });
      const collection = manager.getRunningCollection();
      await collection.preload();
      expect(manager.reconcileRunningWorkflows(collection.toArray)).toBe(true);
      expect(manager.getRunningWorkflowObservations()).toEqual([]);
    } finally {
      await manager.getRunningCollection().cleanup();
      client.setConfig(original);
    }
  });
});
