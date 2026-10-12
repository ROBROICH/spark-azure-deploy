import {
  v1TemporalJobsGetTemporalWorkflow as getTemporalWorkflow,
  type GetWorkflowResponse,
} from '@/api-clients/backend';
import { FAILED_WORKFLOW_STATUSES } from '@/features/workflow-runtime/workflow-status/workflowStatus.helpers';

type ClientResult<TData> = {
  data?: TData;
  error?: unknown;
};

export const COMPLETED_TEMPORAL_WORKFLOW_STATUS: GetWorkflowResponse['status'] =
  'completed';

export const isFailedTemporalWorkflowStatus = (
  status: GetWorkflowResponse['status'],
): boolean => status !== null && FAILED_WORKFLOW_STATUSES.has(status);

export const sleep = (durationMs: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

type LoadTemporalWorkflowOptions = {
  emptyResponseMessage: string;
  getErrorMessage: (error: unknown, fallback: string) => string;
  requestFailedFallback: string;
  workflowId: string;
};

export const loadTemporalWorkflow = async (
  options: LoadTemporalWorkflowOptions,
) => {
  const {
    emptyResponseMessage,
    getErrorMessage,
    requestFailedFallback,
    workflowId,
  } = options;
  const workflowResponse = (await getTemporalWorkflow({
    path: {
      workflowId,
    },
  })) as ClientResult<GetWorkflowResponse>;

  if (workflowResponse.error) {
    throw new Error(
      getErrorMessage(workflowResponse.error, requestFailedFallback),
    );
  }

  if (!workflowResponse.data) {
    throw new Error(emptyResponseMessage);
  }

  return workflowResponse.data;
};

type WaitForTemporalWorkflowCompletionOptions = LoadTemporalWorkflowOptions & {
  failedStatusMessagePrefix: string;
  pollIntervalMs: number;
};

export const waitForTemporalWorkflowCompletion = async (
  options: WaitForTemporalWorkflowCompletionOptions,
) => {
  let isRunning = true;

  // Temporal owns workflow timeouts; this poller expects running workflows to
  // eventually surface a terminal status instead of staying running forever.
  while (isRunning) {
    // eslint-disable-next-line no-await-in-loop -- each poll depends on the latest Temporal status before deciding whether to continue.
    const latestWorkflow = await loadTemporalWorkflow(options);

    if (latestWorkflow.status === COMPLETED_TEMPORAL_WORKFLOW_STATUS) {
      isRunning = false;
    } else if (isFailedTemporalWorkflowStatus(latestWorkflow.status)) {
      throw new Error(
        `${options.failedStatusMessagePrefix} ended with status ${latestWorkflow.status}.`,
      );
    } else {
      // eslint-disable-next-line no-await-in-loop -- polling intentionally waits between dependent workflow status checks.
      await sleep(options.pollIntervalMs);
    }
  }
};
