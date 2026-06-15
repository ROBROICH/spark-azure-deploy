import type { WorkflowsBase } from '@/api-clients/temporal-jobs-module/types.gen';
import { useLiveQuery } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  FAILED_WORKFLOW_STATUSES,
  RUNNING_WORKFLOW_STATUSES,
  getLatestWorkflowsByType,
  getMatchingWorkflows,
  getWorkflowCollectionRequest,
  getWorkflowRunKey,
  normalizeWorkflowValue,
} from './workflowStatus.helpers';
import { useRunningWorkflow } from './useRunningWorkflow';
import type { WorkflowTypeName } from './workflowStatus.types';

export type { WorkflowTypeName } from './workflowStatus.types';

type WorkflowSuccessCallback = (
  workflow: WorkflowsBase,
) => Promise<void> | void;

type UseWorkflowOptions = {
  workflowType?: WorkflowTypeName | WorkflowTypeName[];
  matchIdsInWorkflowId?: string[];
  includeSubWorkflows?: boolean;
  onLatestWorkflowSucceeded?: WorkflowSuccessCallback;
  refetchNodeSummariesOnSuccess?: boolean;
};

const route = getRouteApi('/verfahren/$verfahrenId');
const WORKFLOW_SUCCESS_CALLBACK_DELAY_MS = 4_000;

type PendingFlagStore = {
  getSnapshot: () => boolean;
  setPending: (nextPending: boolean) => void;
  subscribe: (listener: () => void) => () => void;
};

const createPendingFlagStore = (): PendingFlagStore => {
  const listeners = new Set<() => void>();
  let isPending = false;

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getSnapshot: () => isPending,
    setPending: (nextPending) => {
      if (isPending === nextPending) {
        return;
      }

      isPending = nextPending;
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

/** Delays workflow-success callbacks so backend-created data can settle before feature refreshes run. */
// eslint-disable-next-line custom-size/limit-logic-function-lines -- the timer lifecycle, transition guard, and pending loading state need to stay together to avoid split-brain completion handling.
const useLatestWorkflowSuccessEffect = (args: {
  hasSuccessEffect: boolean;
  isDone: boolean;
  isLatestRunPending: boolean;
  latestWorkflow: WorkflowsBase | undefined;
  onLatestWorkflowSucceeded: (workflow: WorkflowsBase) => Promise<void> | void;
  workflowRunKey: string | null;
}) => {
  const {
    hasSuccessEffect,
    isDone,
    isLatestRunPending,
    latestWorkflow,
    onLatestWorkflowSucceeded,
    workflowRunKey,
  } = args;
  // eslint-disable-next-line no-restricted-syntax -- the delayed success timer needs a stable callback while preserving the current owner callback.
  const handleLatestWorkflowSucceeded = useCallback(
    (workflow: WorkflowsBase) => onLatestWorkflowSucceeded(workflow),
    [onLatestWorkflowSucceeded],
  );
  // eslint-disable-next-line no-restricted-syntax -- pending loading is exposed through an external store so transition effects do not synchronize React state from workflow props.
  const successEffectPendingStore = useMemo(() => createPendingFlagStore(), []);
  const isSuccessEffectPending = useSyncExternalStore(
    successEffectPendingStore.subscribe,
    successEffectPendingStore.getSnapshot,
    successEffectPendingStore.getSnapshot,
  );
  const previousWorkflowRef = useRef<{
    isPending: boolean;
    workflowRunKey: string | null;
  }>({
    isPending: false,
    workflowRunKey: null,
  });
  const successCallbackTimeoutRef = useRef<number | null>(null);

  // eslint-disable-next-line no-restricted-syntax -- clears delayed workflow-success callbacks when the observing component unmounts.
  useEffect(() => {
    return () => {
      if (successCallbackTimeoutRef.current === null) {
        return;
      }

      window.clearTimeout(successCallbackTimeoutRef.current);
    };
  }, []);

  // eslint-disable-next-line no-restricted-syntax -- this effect bridges live workflow refreshes into a one-time callback when the tracked latest run succeeds
  useEffect(() => {
    const previousWorkflow = previousWorkflowRef.current;
    const isSuccessTransition =
      previousWorkflow.workflowRunKey === workflowRunKey &&
      previousWorkflow.isPending &&
      !isLatestRunPending &&
      isDone &&
      latestWorkflow !== undefined;

    if (isSuccessTransition && hasSuccessEffect) {
      successEffectPendingStore.setPending(true);

      if (successCallbackTimeoutRef.current !== null) {
        window.clearTimeout(successCallbackTimeoutRef.current);
      }

      successCallbackTimeoutRef.current = window.setTimeout(() => {
        successCallbackTimeoutRef.current = null;
        void Promise.resolve()
          .then(() => handleLatestWorkflowSucceeded(latestWorkflow))
          .then(
            () => successEffectPendingStore.setPending(false),
            (error: unknown) => {
              successEffectPendingStore.setPending(false);
              throw error;
            },
          );
      }, WORKFLOW_SUCCESS_CALLBACK_DELAY_MS);
    }

    if (!isSuccessTransition && successCallbackTimeoutRef.current !== null) {
      const isSameWorkflowRun =
        previousWorkflow.workflowRunKey === workflowRunKey;
      const didRunRestart = isSameWorkflowRun && isLatestRunPending;

      if (didRunRestart) {
        window.clearTimeout(successCallbackTimeoutRef.current);
        successCallbackTimeoutRef.current = null;
        successEffectPendingStore.setPending(false);
      }
    }

    previousWorkflowRef.current = {
      isPending: isLatestRunPending,
      workflowRunKey,
    };
  }, [
    handleLatestWorkflowSucceeded,
    hasSuccessEffect,
    isDone,
    isLatestRunPending,
    latestWorkflow,
    successEffectPendingStore,
    workflowRunKey,
  ]);

  return isSuccessEffectPending;
};

const useWorkflowHistoryRefetch = (args: {
  isRunning: boolean;
  refresh: () => Promise<unknown> | unknown;
}) => {
  const { isRunning, refresh } = args;
  const previousRunningRef = useRef(isRunning);
  // eslint-disable-next-line no-restricted-syntax -- the running-state bridge needs one stable refresh command for its transition effect.
  const refreshHistory = useCallback(() => {
    void Promise.resolve(refresh()).catch(() => undefined);
  }, [refresh]);

  // eslint-disable-next-line no-restricted-syntax -- refreshes historical workflow data when the running-workflow read model says a matching run starts or settles.
  useEffect(() => {
    const wasRunning = previousRunningRef.current;
    previousRunningRef.current = isRunning;

    if (isRunning || wasRunning) {
      refreshHistory();
    }
  }, [isRunning, refreshHistory]);
};

/**
 * Reads project workflows from the verfahren route collection and derives
 * reusable workflow-state flags for type-scoped UI decisions.
 */
export const useWorkflow = (options: UseWorkflowOptions = {}) => {
  const { workflowsManager } = route.useLoaderData();
  const workflowCollectionRequest = getWorkflowCollectionRequest({
    includeSubWorkflows: options.includeSubWorkflows,
    workflowType: options.workflowType,
  });
  const workflowsCollection = workflowsManager.getCollection(
    workflowCollectionRequest,
  );
  const {
    data: allWorkflows = [],
    isLoading,
    isError,
  } = useLiveQuery(workflowsCollection);
  const { isRunning: isRunningWorkflow } = useRunningWorkflow({
    workflowType: options.workflowType,
    matchIdsInWorkflowId: options.matchIdsInWorkflowId,
    refetchNodeSummariesOnSuccess: options.refetchNodeSummariesOnSuccess,
  });
  useWorkflowHistoryRefetch({
    isRunning: isRunningWorkflow,
    refresh: () => workflowsManager.refetch(workflowCollectionRequest),
  });
  const shouldRefetchNodeSummariesOnSuccess =
    options.refetchNodeSummariesOnSuccess ?? true;
  const workflows = getMatchingWorkflows({
    workflows: allWorkflows,
    workflowType: options.workflowType,
    matchIdsInWorkflowId: options.matchIdsInWorkflowId,
  });
  const latestWorkflow = workflows.at(0);
  const latestWorkflowStatus = normalizeWorkflowValue(latestWorkflow?.status);
  const subWorkflows = options.includeSubWorkflows
    ? (latestWorkflow?.children ?? [])
    : [];
  const isLatestRunPending =
    latestWorkflow !== undefined &&
    RUNNING_WORKFLOW_STATUSES.has(latestWorkflowStatus);
  const isRunning = isRunningWorkflow;
  const isDone = latestWorkflowStatus === 'completed';
  const isFailed = FAILED_WORKFLOW_STATUSES.has(latestWorkflowStatus);
  const hasSuccessfulRun = workflows.some(
    (workflow) => normalizeWorkflowValue(workflow.status) === 'completed',
  );
  const workflowRunKey = getWorkflowRunKey(latestWorkflow);

  const isSuccessEffectPending = useLatestWorkflowSuccessEffect({
    hasSuccessEffect:
      shouldRefetchNodeSummariesOnSuccess ||
      options.onLatestWorkflowSucceeded !== undefined,
    isDone,
    isLatestRunPending,
    latestWorkflow,
    onLatestWorkflowSucceeded: (workflow) =>
      options.onLatestWorkflowSucceeded?.(workflow),
    workflowRunKey,
  });

  return {
    workflows,
    latestWorkflow,
    latestWorkflowsByType: getLatestWorkflowsByType(workflows),
    subWorkflows,
    hasAnyRun: workflows.length > 0,
    hasSuccessfulRun,
    isRunning,
    isLastRunError: isFailed,
    isLastRunSuccessful: isDone,
    isDone,
    isFailed,
    isLoading: isLoading || isSuccessEffectPending,
    isError,
  };
};
