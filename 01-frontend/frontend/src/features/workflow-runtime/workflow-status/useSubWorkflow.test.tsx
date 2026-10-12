import { client } from '@/api-clients/backend/client.gen';
import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSubWorkflow } from './useSubWorkflow';
import {
  WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
  WORKFLOW_TYPE_FVP,
} from './workflowStatus.helpers';
import type { WorkflowState } from './workflowStatus.types';

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: '62000000-0000-4000-8000-000000000004' }),
    useLoaderData: () => ({ projectVersion: 1 }),
  }),
}));

const root: WorkflowsBase = {
  workflowId: 'FVPWorkflow-62000000-0000-4000-8000-000000000004-v1',
  runId: '62000000-0000-4000-8000-000000000005',
  workflowType: WORKFLOW_TYPE_FVP,
  status: 'running',
  workflowStartTime: '2026-09-01T08:00:00.000Z',
  workflowCloseTime: null,
  projectId: '62000000-0000-4000-8000-000000000004',
  projectVersion: 1,
  failure: null,
};
const workflowState: WorkflowState = {
  workflows: [root],
  latestWorkflow: root,
  latestWorkflowsByType: [],
  hasAnyRun: true,
  hasSuccessfulRun: false,
  isRunning: true,
  latestFailure: null,
  isLastRunError: false,
  isLastRunSuccessful: false,
  isDone: false,
  isFailed: false,
  isLoading: false,
  isError: false,
};
const child: WorkflowsBase = {
  ...root,
  workflowId: 'plausibility-stage',
  runId: '62000000-0000-4000-8000-000000000006',
  workflowType: WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
  workflowStartTime: '2026-09-01T09:00:00.000Z',
};
const originalClient = client.getConfig();
let queryClient: QueryClient;
let replies: Partial<Record<string, WorkflowsBase[]>>;
let unavailable = false;
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  replies = {};
  unavailable = false;
  client.setConfig({
    baseUrl: 'http://temporal-stage.test',
    fetch: (request) => {
      if (unavailable) {
        return Promise.resolve(
          Response.json({ message: 'Temporal unavailable' }, { status: 503 }),
        );
      }
      const url = new URL(
        request instanceof Request ? request.url : String(request),
      );
      const workflows =
        replies[url.searchParams.get('executionStatus') ?? 'all'] ?? [];
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

afterEach(() => {
  cleanup();
  queryClient.clear();
  client.setConfig(originalClient);
});

describe('root-scoped subworkflow status', () => {
  it('finishes a completed stage while the parent continues other work', async () => {
    const completed: WorkflowsBase = {
      ...child,
      status: 'completed',
      workflowCloseTime: '2026-09-01T09:01:00.000Z',
    };
    replies = { all: [completed] };
    const { result } = renderHook(
      () =>
        useSubWorkflow({
          workflowState,
          subWorkflowType: WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isRunning).toBe(false);
  });

  it('reports the failure a failed stage summary carries, and none once it completed', async () => {
    const failed: WorkflowsBase = {
      ...child,
      status: 'timed_out',
      workflowCloseTime: '2026-09-01T09:01:00.000Z',
      failure: { errorCode: 'ANALYSIS_TIMED_OUT', branches: [] },
    };
    replies = { all: [failed] };
    const { result } = renderHook(
      () =>
        useSubWorkflow({
          workflowState,
          subWorkflowType: WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
        }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.failureCode).toBe('ANALYSIS_TIMED_OUT'),
    );
    expect(result.current.hasCompletedRun).toBe(false);

    replies = { all: [{ ...failed, status: 'completed', failure: null }] };
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await waitFor(() => expect(result.current.hasCompletedRun).toBe(true));
    expect(result.current.failureCode).toBeNull();
  });

  it('keeps a stage pending while the parent runs and no stage run exists yet', async () => {
    const { result } = renderHook(
      () =>
        useSubWorkflow({
          workflowState,
          subWorkflowType: WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isStatusLoading).toBe(false));
    expect(result.current.isLoading).toBe(true);
  });

  it('keeps the last running state and exposes an unavailable poll instead of announcing completion', async () => {
    replies = { all: [child], Running: [child] };
    const { result } = renderHook(
      () =>
        useSubWorkflow({
          workflowState,
          subWorkflowType: WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isRunning).toBe(true));
    unavailable = true;
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isRunning).toBe(true);
    expect(result.current.isLoading).toBe(true);
  });
});
