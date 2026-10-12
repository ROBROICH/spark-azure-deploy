import { client } from '@/api-clients/backend/client.gen';
import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLatestWorkflowFailureByTarget } from './useLatestWorkflowFailureByTarget';
import { WORKFLOW_TYPE_SUZ_NORM } from './workflowStatus.helpers';

const projectId = '62000000-0000-4000-8000-000000000007';

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: projectId }),
    useLoaderData: () => ({ projectVersion: 1 }),
  }),
}));

const running = vi.hoisted((): { workflowIds: string[] } => ({
  workflowIds: [],
}));
vi.mock('./useRunningWorkflow', () => ({
  useRunningWorkflow: () => ({
    isRunning: running.workflowIds.length > 0,
    runningWorkflowIds: running.workflowIds,
  }),
}));

const suzWorkflowId = (normId: string) =>
  `${WORKFLOW_TYPE_SUZ_NORM}-${projectId}-v1-${normId}`;
const run = (
  normId: string,
  overrides: Partial<WorkflowsBase> & Pick<WorkflowsBase, 'workflowStartTime'>,
): WorkflowsBase => ({
  workflowId: suzWorkflowId(normId),
  runId: `${normId}-${overrides.workflowStartTime}`,
  workflowType: WORKFLOW_TYPE_SUZ_NORM,
  projectId,
  projectVersion: 1,
  status: 'completed',
  workflowCloseTime: null,
  failure: null,
  ...overrides,
});

const originalClient = client.getConfig();
let queryClient: QueryClient;
let requests: URLSearchParams[];
let rejectRequest: (query: URLSearchParams) => boolean;
let reply: (query: URLSearchParams) => {
  nextPageToken: string | null;
  workflows: WorkflowsBase[];
};
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
const renderFailures = (normIds: string[]) =>
  renderHook(
    () =>
      useLatestWorkflowFailureByTarget({
        targetIds: normIds,
        workflowType: WORKFLOW_TYPE_SUZ_NORM,
      }),
    { wrapper },
  );

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  requests = [];
  running.workflowIds = [];
  rejectRequest = () => false;
  reply = () => ({ nextPageToken: null, workflows: [] });
  client.setConfig({
    baseUrl: 'http://temporal-targets.test',
    fetch: (request) => {
      const url = new URL(
        request instanceof Request ? request.url : String(request),
      );
      requests.push(url.searchParams);
      if (rejectRequest(url.searchParams)) {
        return Promise.resolve(
          Response.json({ message: 'unavailable' }, { status: 503 }),
        );
      }
      const page = reply(url.searchParams);
      return Promise.resolve(
        Response.json({
          projectId,
          workflowType: WORKFLOW_TYPE_SUZ_NORM,
          retrievedWorkflows: page.workflows.length,
          ...page,
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

describe('latest workflow failure by target', () => {
  it('requests every target workflow id exactly once, at most 50 per request', async () => {
    const normIds = Array.from({ length: 60 }, (_, index) => `norm-${index}`);

    renderFailures(normIds);

    await waitFor(() => expect(requests).toHaveLength(2));
    const requestedIds = requests.map((query) => query.getAll('workflowIds'));
    expect(requestedIds.every((ids) => ids.length <= 50)).toBe(true);
    expect(requestedIds.flat().sort()).toEqual(
      normIds.map(suzWorkflowId).sort(),
    );
  });

  it('keeps the failures of the other requests when one request fails', async () => {
    const normIds = Array.from(
      { length: 60 },
      (_, index) => `norm-${String(index).padStart(2, '0')}`,
    );
    // Sorted ids put norm-00 to norm-49 in the first request and the rest in
    // the second.
    const failedRuns = [
      run('norm-05', {
        status: 'failed',
        workflowStartTime: '2026-09-01T08:00:00.000Z',
      }),
      run('norm-55', {
        status: 'timed_out',
        failure: { errorCode: 'ANALYSIS_TIMED_OUT', branches: [] },
        workflowStartTime: '2026-09-01T08:00:00.000Z',
      }),
    ];
    rejectRequest = (query) =>
      query.getAll('workflowIds').includes(suzWorkflowId('norm-05'));
    reply = (query) => ({
      nextPageToken: null,
      workflows: failedRuns.filter(({ workflowId }) =>
        query.getAll('workflowIds').includes(workflowId),
      ),
    });

    const { result } = renderFailures(normIds);

    await waitFor(() => {
      expect(requests).toHaveLength(2);
      expect(queryClient.isFetching()).toBe(0);
      expect(result.current.failureCodeByTargetId).toEqual(
        new Map([['norm-55', 'ANALYSIS_TIMED_OUT']]),
      );
    });
  });

  it('follows the next page token of a request', async () => {
    reply = (query) =>
      query.get('nextPageToken') === 'page-2'
        ? {
            nextPageToken: null,
            workflows: [
              run('norm-1', {
                status: 'failed',
                workflowStartTime: '2026-09-02T08:00:00.000Z',
              }),
            ],
          }
        : {
            nextPageToken: 'page-2',
            workflows: [
              run('norm-1', { workflowStartTime: '2026-09-01T08:00:00.000Z' }),
            ],
          };

    const { result } = renderFailures(['norm-1']);

    await waitFor(() =>
      expect(result.current.failureCodeByTargetId.get('norm-1')).toBe(
        'ANALYSIS_FAILED',
      ),
    );
  });

  it('lets the newest run of each target decide its failure', async () => {
    reply = () => ({
      nextPageToken: null,
      workflows: [
        run('recovered', {
          status: 'failed',
          workflowStartTime: '2026-09-01T08:00:00.000Z',
        }),
        run('recovered', { workflowStartTime: '2026-09-02T08:00:00.000Z' }),
        run('timed-out', {
          status: 'timed_out',
          failure: { errorCode: 'ANALYSIS_TIMED_OUT', branches: [] },
          workflowStartTime: '2026-09-02T08:00:00.000Z',
        }),
        run('no-details', { workflowStartTime: '2026-09-01T08:00:00.000Z' }),
        run('no-details', {
          status: 'failed',
          workflowStartTime: '2026-09-02T08:00:00.000Z',
        }),
      ],
    });

    const { result } = renderFailures(['recovered', 'timed-out', 'no-details']);

    await waitFor(() =>
      expect(result.current.failureCodeByTargetId.size).toBeGreaterThan(0),
    );
    expect(result.current.failureCodeByTargetId).toEqual(
      new Map([
        ['timed-out', 'ANALYSIS_TIMED_OUT'],
        ['no-details', 'ANALYSIS_FAILED'],
      ]),
    );
  });

  it('clears a failure when a rerun succeeds while another run of the type keeps running', async () => {
    const failedRun = run('rerun', {
      status: 'failed',
      workflowStartTime: '2026-09-01T08:00:00.000Z',
    });
    let workflows = [failedRun];
    reply = () => ({ nextPageToken: null, workflows });
    running.workflowIds = [suzWorkflowId('long')];
    const { rerender, result } = renderFailures(['rerun', 'long']);
    await waitFor(() =>
      expect(result.current.failureCodeByTargetId.has('rerun')).toBe(true),
    );

    // Visibility may not list the rerun yet when its start refetch runs.
    const requestsBeforeStart = requests.length;
    running.workflowIds = [suzWorkflowId('long'), suzWorkflowId('rerun')];
    rerender();
    await waitFor(() =>
      expect(requests.length).toBeGreaterThan(requestsBeforeStart),
    );

    workflows = [
      failedRun,
      run('rerun', { workflowStartTime: '2026-09-02T08:00:00.000Z' }),
    ];
    running.workflowIds = [suzWorkflowId('long')];
    rerender();
    await waitFor(() =>
      expect(result.current.failureCodeByTargetId.has('rerun')).toBe(false),
    );
  });
});
