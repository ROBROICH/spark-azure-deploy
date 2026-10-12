import { client } from '@/api-clients/backend/client.gen';
import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { getProjectTemporalWorkflowsManager } from '@/features/workflow-runtime/workflow-status/projectTemporalWorkflows.collection';
import {
  WORKFLOW_TYPE_EWMS,
  WORKFLOW_TYPE_FILE_PROCESSING,
} from '@/features/workflow-runtime/workflow-status/workflowStatus.helpers';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEwmsImportJobState } from './useEwmsImportJobState';

const scope = vi.hoisted(() => ({
  projectId: '62000000-0000-4000-8000-000000000020',
  projectVersion: 0,
}));
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: scope.projectId }),
    useLoaderData: () => ({
      projectVersion: scope.projectVersion,
      workflowsManager: getProjectTemporalWorkflowsManager(
        scope.projectId,
        scope.projectVersion,
      ),
    }),
  }),
}));

const originalClient = client.getConfig();
const originalDefaults = queryClient.getDefaultOptions();
let childRunning = false;
let unavailable = false;
const wrapper = ({ children }: PropsWithChildren) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  scope.projectVersion += 1;
  childRunning = false;
  unavailable = false;
  queryClient.setDefaultOptions({
    ...originalDefaults,
    queries: { ...originalDefaults.queries, retry: false },
  });
  client.setConfig({
    baseUrl: 'http://ewms-status.test',
    fetch: (request) => {
      if (unavailable) {
        return Promise.resolve(
          Response.json({ message: 'Temporal unavailable' }, { status: 503 }),
        );
      }
      const url = new URL(
        request instanceof Request ? request.url : String(request),
      );
      const descendant = url.searchParams.has('rootRunId');
      const status = url.searchParams.get('executionStatus');
      const running: WorkflowsBase = {
        workflowId: descendant
          ? 'ewms-running-child'
          : `DMSFileProcessingWorkflow-${scope.projectId}`,
        runId: descendant
          ? '62000000-0000-4000-8000-000000000022'
          : '62000000-0000-4000-8000-000000000021',
        workflowType: descendant
          ? WORKFLOW_TYPE_EWMS
          : WORKFLOW_TYPE_FILE_PROCESSING,
        status: 'running',
        workflowStartTime: '2026-09-01T08:00:00.000Z',
        workflowCloseTime: null,
        projectId: scope.projectId,
        projectVersion: scope.projectVersion,
        failure: null,
      };
      const workflows =
        (status === 'all' || status === 'Running') &&
        (!descendant || childRunning)
          ? [running]
          : [];
      return Promise.resolve(
        Response.json({
          workflows,
          retrievedWorkflows: workflows.length,
          nextPageToken: null,
        }),
      );
    },
  });
});

afterEach(async () => {
  cleanup();
  const manager = getProjectTemporalWorkflowsManager(
    scope.projectId,
    scope.projectVersion,
  );
  await manager
    .getCollection({ workflowType: WORKFLOW_TYPE_FILE_PROCESSING })
    .cleanup();
  await manager
    .getCollection({
      workflowType: WORKFLOW_TYPE_FILE_PROCESSING,
      executionStatus: 'Running',
    })
    .cleanup();
  queryClient.clear();
  queryClient.setDefaultOptions(originalDefaults);
  client.setConfig(originalClient);
});

describe('EWMS import status', () => {
  it('keeps file processing separate from an EWMS orchestrator that has not started', async () => {
    const { result } = renderHook(
      () => useEwmsImportJobState(scope.projectId),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.isFileProcessingWorkflowRunning).toBe(true),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEwmsWorkflowRunning).toBe(false);
    expect(result.current.isEwmsFileImportWorkflowRunning).toBe(true);
  });

  it('retains the verified running child and exposes an unavailable poll without declaring completion', async () => {
    childRunning = true;
    const { result } = renderHook(
      () => useEwmsImportJobState(scope.projectId),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.isEwmsWorkflowRunning).toBe(true),
    );
    expect(result.current.latestRunningWorkflow?.runId).toBe(
      '62000000-0000-4000-8000-000000000022',
    );
    unavailable = true;
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isEwmsWorkflowRunning).toBe(true);
    expect(result.current.isEwmsFileImportWorkflowRunning).toBe(true);
  });
});
