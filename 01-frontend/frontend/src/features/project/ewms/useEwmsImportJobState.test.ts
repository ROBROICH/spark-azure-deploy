import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEwmsImportJobState } from './useEwmsImportJobState';

const mocks = vi.hoisted(() => ({
  getWorkflowTemporalWorkflowsWorkflowIdGet: vi.fn(),
  useQuery: vi.fn(),
  useWorkflow: vi.fn(),
}));

vi.mock('@/api-clients/temporal-jobs-module', () => ({
  getWorkflowTemporalWorkflowsWorkflowIdGet:
    mocks.getWorkflowTemporalWorkflowsWorkflowIdGet,
}));

vi.mock('@/features/workflow-runtime/workflow-status/useWorkflow', () => ({
  useWorkflow: mocks.useWorkflow,
}));

vi.mock(
  '@/features/workflow-runtime/workflow-status/useRunningWorkflow',
  () => ({
    WORKFLOW_TYPE_FILE_PROCESSING: 'FileProcessingWorkflow',
  }),
);

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}));

const createWorkflowState = (overrides = {}) => ({
  workflows: [],
  latestWorkflow: undefined,
  latestWorkflowsByType: [],
  subWorkflows: [],
  hasAnyRun: false,
  hasSuccessfulRun: false,
  isRunning: false,
  isLastRunError: false,
  isLastRunSuccessful: false,
  isDone: false,
  isFailed: false,
  isLoading: false,
  isError: false,
  ...overrides,
});

describe('useEwmsImportJobState', () => {
  beforeEach(() => {
    mocks.getWorkflowTemporalWorkflowsWorkflowIdGet.mockReset();
    mocks.useQuery.mockReset();
    mocks.useQuery.mockReturnValue({
      data: [],
      isError: false,
    });
    mocks.useWorkflow.mockReset();
    mocks.useWorkflow.mockReturnValue(createWorkflowState());
  });

  it('loads FileProcessing workflows with children in the current project scope', () => {
    renderHook(() => useEwmsImportJobState('project-1'));

    expect(mocks.useWorkflow).toHaveBeenCalledWith({
      includeSubWorkflows: true,
      matchIdsInWorkflowId: ['project-1'],
      workflowType: 'FileProcessingWorkflow',
    });
  });

  it('loads detail for deeply nested running EWMS child candidates', async () => {
    mocks.useWorkflow.mockReturnValue(
      createWorkflowState({
        workflows: [
          {
            status: 'completed',
            workflow_id: 'file-processing-1',
            workflow_type: 'FileProcessingWorkflow',
            children: [
              {
                status: 'completed',
                workflow_id: 'intermediate-1',
                workflow_type: 'IntermediateWorkflow',
                children: [
                  {
                    status: 'running',
                    workflow_id: 'ewms-1',
                    workflow_type: 'EWMSOrchestratorWorkflow',
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    renderHook(() => useEwmsImportJobState('project-1'));
    const queryOptions = mocks.useQuery.mock.calls[0]?.[0];
    mocks.getWorkflowTemporalWorkflowsWorkflowIdGet.mockResolvedValue({
      data: {
        run_id: 'run-ewms-1',
        status: 'completed',
        workflow_id: 'ewms-1',
        workflow_type: 'EWMSOrchestratorWorkflow',
      },
    });

    await queryOptions.queryFn();

    expect(queryOptions).toMatchObject({
      enabled: true,
      queryKey: ['ewms-running-workflow-details', ['ewms-1']],
      refetchInterval: 10_000,
    });
    expect(
      mocks.getWorkflowTemporalWorkflowsWorkflowIdGet,
    ).toHaveBeenCalledWith({
      path: {
        workflow_id: 'ewms-1',
      },
      throwOnError: true,
    });
  });

  it('falls back to the running child snapshot when a workflow detail request fails', async () => {
    mocks.useWorkflow.mockReturnValue(
      createWorkflowState({
        workflows: [
          {
            status: 'completed',
            workflow_id: 'file-processing-1',
            workflow_type: 'FileProcessingWorkflow',
            children: [
              {
                status: 'running',
                workflow_id: 'ewms-1',
                workflow_type: 'EWMSOrchestratorWorkflow',
              },
              {
                status: 'running',
                workflow_id: 'ewms-2',
                workflow_type: 'EWMSOrchestratorWorkflow',
              },
            ],
          },
        ],
      }),
    );
    renderHook(() => useEwmsImportJobState('project-1'));
    const queryOptions = mocks.useQuery.mock.calls[0]?.[0];
    mocks.getWorkflowTemporalWorkflowsWorkflowIdGet
      .mockRejectedValueOnce(new Error('detail unavailable'))
      .mockResolvedValueOnce({
        data: {
          run_id: 'run-ewms-2',
          status: 'completed',
          workflow_id: 'ewms-2',
          workflow_type: 'EWMSOrchestratorWorkflow',
        },
      });

    const details = await queryOptions.queryFn();

    expect(details).toEqual([
      {
        run_id: 'ewms-1',
        status: 'running',
        workflow_id: 'ewms-1',
        workflow_type: 'EWMSOrchestratorWorkflow',
      },
      {
        run_id: 'ewms-2',
        status: 'completed',
        workflow_id: 'ewms-2',
        workflow_type: 'EWMSOrchestratorWorkflow',
      },
    ]);
  });

  it('does not trust stale running child snapshots without running detail status', () => {
    mocks.useWorkflow.mockReturnValue(
      createWorkflowState({
        workflows: [
          {
            status: 'completed',
            workflow_id: 'file-processing-1',
            workflow_type: 'FileProcessingWorkflow',
            children: [
              {
                status: 'running',
                workflow_id: 'ewms-1',
                workflow_type: 'EWMSOrchestratorWorkflow',
              },
            ],
          },
        ],
      }),
    );
    mocks.useQuery.mockReturnValue({
      data: [
        {
          run_id: 'run-ewms-1',
          status: 'completed',
          workflow_id: 'ewms-1',
          workflow_type: 'EWMSOrchestratorWorkflow',
        },
      ],
      isError: false,
    });

    const { result } = renderHook(() => useEwmsImportJobState('project-1'));

    expect(result.current.isEwmsWorkflowRunning).toBe(false);
    expect(result.current.isEwmsFileImportWorkflowRunning).toBe(false);
    expect(result.current.latestRunningWorkflow).toBeUndefined();
  });

  it('marks EWMS as running only from verified detail status', () => {
    mocks.useWorkflow.mockReturnValue(
      createWorkflowState({
        workflows: [
          {
            status: 'completed',
            workflow_id: 'file-processing-1',
            workflow_type: 'FileProcessingWorkflow',
            children: [
              {
                status: 'running',
                workflow_id: 'ewms-1',
                workflow_type: 'EWMSOrchestratorWorkflow',
              },
            ],
          },
        ],
      }),
    );
    mocks.useQuery.mockReturnValue({
      data: [
        {
          run_id: 'run-ewms-1',
          status: 'running',
          workflow_id: 'ewms-1',
          workflow_start_time: '2026-05-02T00:00:00.000Z',
          workflow_type: 'EWMSOrchestratorWorkflow',
        },
      ],
      isError: false,
    });

    const { result } = renderHook(() => useEwmsImportJobState('project-1'));

    expect(result.current.isEwmsWorkflowRunning).toBe(true);
    expect(result.current.isEwmsFileImportWorkflowRunning).toBe(true);
    expect(result.current.latestRunningWorkflow?.workflow_id).toBe('ewms-1');
  });

  it('keeps file processing running separate from EWMS orchestrator running', () => {
    mocks.useWorkflow.mockReturnValue(
      createWorkflowState({
        isRunning: true,
        workflows: [],
      }),
    );

    const { result } = renderHook(() => useEwmsImportJobState('project-1'));

    expect(result.current.isFileProcessingWorkflowRunning).toBe(true);
    expect(result.current.isEwmsWorkflowRunning).toBe(false);
    expect(result.current.isEwmsFileImportWorkflowRunning).toBe(true);
  });

  it('exposes workflow loading and detail error states', () => {
    mocks.useWorkflow.mockReturnValue(
      createWorkflowState({
        isLoading: true,
      }),
    );
    mocks.useQuery.mockReturnValue({
      data: [],
      isError: true,
    });

    const { result } = renderHook(() => useEwmsImportJobState('project-1'));

    expect(result.current.isError).toBe(true);
    expect(result.current.isLoading).toBe(true);
  });
});
