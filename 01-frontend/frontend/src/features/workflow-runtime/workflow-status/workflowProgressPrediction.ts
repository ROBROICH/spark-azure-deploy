import type { WorkflowsBase } from '@/api-clients/temporal-jobs-module/types.gen';
import {
  getFakeProgressPercent,
  getFakeRemainingMinutes,
} from '@/features/workflow-runtime/progress/fakeProgress';

const MINUTES_PER_HOUR = 60;
const MAX_RUNNING_PROGRESS_PERCENT = 90;

export type WorkflowStartTimeSource = Pick<
  WorkflowsBase,
  'workflow_start_time'
>;

export type WorkflowRemainingTimeEstimate = {
  count: number;
  unit: 'hours' | 'minutes';
};

export type FakeWorkflowProgressStatus = 'done' | 'overEstimate' | 'running';

export type FakeWorkflowProgressPrediction = {
  progressPercent: number;
  remainingTime: WorkflowRemainingTimeEstimate;
  startedAt: number;
  status: FakeWorkflowProgressStatus;
};

export const getWorkflowStartTimeMs = (
  workflowStartTime: string | null | undefined,
) => {
  const parsedTime = Date.parse(workflowStartTime ?? '');

  return Number.isNaN(parsedTime) ? undefined : parsedTime;
};

export const getWorkflowStartedAtMs = (params: {
  fallbackStartedAt: number;
  workflowStartedAt: string | null | undefined;
}) => {
  const { fallbackStartedAt, workflowStartedAt } = params;

  return getWorkflowStartTimeMs(workflowStartedAt) ?? fallbackStartedAt;
};

export const getWorkflowRemainingTimeEstimate = (params: {
  estimatedDurationMs: number;
  now: number;
  startedAt: number;
}): WorkflowRemainingTimeEstimate => {
  const remainingMinutes = getFakeRemainingMinutes(params);

  if (remainingMinutes >= MINUTES_PER_HOUR) {
    return {
      count: Math.ceil(remainingMinutes / MINUTES_PER_HOUR),
      unit: 'hours',
    };
  }

  return {
    count: remainingMinutes,
    unit: 'minutes',
  };
};

export const getFakeWorkflowProgressPrediction = (params: {
  estimatedDurationMs: number;
  fallbackStartedAt: number;
  isDone?: boolean;
  now: number;
  workflow: WorkflowStartTimeSource;
}): FakeWorkflowProgressPrediction => {
  const {
    estimatedDurationMs,
    fallbackStartedAt,
    isDone = false,
    now,
    workflow,
  } = params;
  const startedAt = getWorkflowStartedAtMs({
    fallbackStartedAt,
    workflowStartedAt: workflow.workflow_start_time,
  });
  const progressPercent = getFakeProgressPercent({
    estimatedDurationMs,
    isDone,
    now,
    startedAt,
  });
  const remainingTime = getWorkflowRemainingTimeEstimate({
    estimatedDurationMs,
    now,
    startedAt,
  });
  const status: FakeWorkflowProgressStatus = isDone
    ? 'done'
    : progressPercent >= MAX_RUNNING_PROGRESS_PERCENT
      ? 'overEstimate'
      : 'running';

  return {
    progressPercent,
    remainingTime,
    startedAt,
    status,
  };
};
