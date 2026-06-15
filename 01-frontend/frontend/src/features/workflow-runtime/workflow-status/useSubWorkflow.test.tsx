import type {
  ChildWorkflowInfo,
  WorkflowsBase,
} from '@/api-clients/temporal-jobs-module/types.gen';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getSubWorkflowStateFromWorkflowState } from './useSubWorkflow';
import {
  WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
  WORKFLOW_TYPE_FVP,
  WORKFLOW_TYPE_LLM_MATCHING,
} from './workflowStatus.helpers';

type WorkflowState = Parameters<
  typeof getSubWorkflowStateFromWorkflowState
>[0]['workflowState'];
type TestChildWorkflow = ChildWorkflowInfo & {
  workflow_start_time?: string | null;
};

const createWorkflow = (
  overrides: Pick<WorkflowsBase, 'workflow_id' | 'workflow_type' | 'status'> &
    Partial<WorkflowsBase>,
): WorkflowsBase => ({
  run_id: 'run-id',
  workflow_start_time: '2026-04-09T00:00:00.000Z',
  ...overrides,
});

const createChildWorkflow = (
  overrides: Pick<
    TestChildWorkflow,
    'workflow_id' | 'workflow_type' | 'status'
  > &
    Partial<TestChildWorkflow>,
): TestChildWorkflow => {
  const {
    workflow_id = 'child-run',
    workflow_type = WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
    status = 'pending',
    ...restOverrides
  } = overrides;

  return {
    workflow_id,
    workflow_type,
    status,
    ...restOverrides,
  };
};

const createWorkflowState = (
  overrides: Partial<WorkflowState> = {},
): WorkflowState => ({
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

const getPlausibilitySubWorkflowState = (workflowState: WorkflowState) =>
  getSubWorkflowStateFromWorkflowState({
    workflowState,
    subWorkflowType: WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
  });

describe('getSubWorkflowStateFromWorkflowState', () => {
  afterEach(cleanup);

  it('derives the loading state from matching child workflows only', () => {
    const workflowState = createWorkflowState({
      latestWorkflow: createWorkflow({
        workflow_id: 'fvp-run',
        workflow_type: WORKFLOW_TYPE_FVP,
        status: 'running',
      }),
      subWorkflows: [
        createChildWorkflow({
          workflow_id: 'llm-run',
          workflow_type: WORKFLOW_TYPE_LLM_MATCHING,
          status: 'completed',
        }),
        createChildWorkflow({
          workflow_id: 'pp-run',
          workflow_type: WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
          status: 'completed',
        }),
      ],
    });

    const result = getPlausibilitySubWorkflowState(workflowState);

    expect(result).toMatchObject({
      hasAnyRun: true,
      hasSuccessfulRun: true,
      isDone: true,
      isLoading: false,
      isRunning: false,
    });
  });

  it('picks the latest matching child workflow instead of the first traversal match', () => {
    const workflowState = createWorkflowState({
      latestWorkflow: createWorkflow({
        workflow_id: 'fvp-run',
        workflow_type: WORKFLOW_TYPE_FVP,
        status: 'running',
      }),
      subWorkflows: [
        createChildWorkflow({
          workflow_id: 'pp-run-older',
          workflow_start_time: '2026-04-09T00:00:00.000Z',
          workflow_type: WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
          status: 'failed',
        }),
        createChildWorkflow({
          workflow_id: 'pp-run-newer',
          workflow_start_time: '2026-04-10T00:00:00.000Z',
          workflow_type: WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
          status: 'pending',
        }),
      ],
    });

    const result = getPlausibilitySubWorkflowState(workflowState);

    expect(result.latestSubWorkflow?.workflow_id).toBe('pp-run-newer');
    expect(result.isFailed).toBe(false);
    expect(result.isLoading).toBe(true);
  });
});
