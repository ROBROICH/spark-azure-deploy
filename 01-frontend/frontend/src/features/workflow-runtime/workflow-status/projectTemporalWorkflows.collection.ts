/* eslint-disable max-lines -- workflow collection setup keeps related Temporal loaders, collection factories, and the cached project manager in one module. */
import {
  v1TemporalJobsGetTemporalWorkflow as getTemporalWorkflow,
  v1TemporalJobsListTemporalWorkflowsByType as listTemporalWorkflowsByType,
  v1TemporalJobsListTemporalWorkflows as listTemporalWorkflows,
} from '@/api-clients/backend';
import type {
  V1TemporalJobsGetTemporalWorkflowResponse,
  WorkflowsBase,
} from '@/api-clients/backend/types.gen';
import { createLruCache } from '@/db/nodes/lruCache';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { BasicIndex, createCollection } from '@tanstack/react-db';
import { getTargetWorkflowId } from './workflowStatus.helpers';

const WORKFLOW_REFETCH_INTERVAL_MS = 30_000;
const RUNNING_WORKFLOWS_COLLECTION_KEY = '__running__';

export type WorkflowCollectionRequest = {
  workflowType?: string | string[];
  workflowId?: string;
  targetId?: string;
  rootWorkflowId?: string;
  rootRunId?: string;
  executionStatus?:
    | 'all'
    | 'Running'
    | 'Completed'
    | 'Failed'
    | 'Canceled'
    | 'Terminated'
    | 'TimedOut';
};

type RunningWorkflowObservation = {
  observedAt: number;
  refetchNodeSummariesOnSuccess: boolean;
  workflowTypes: string[];
};

type SetRunningWorkflowObservationOptions = {
  observedAt?: number;
  refetchNodeSummariesOnSuccess?: boolean;
  workflowType?: string | string[];
};

const WORKFLOW_COLLECTION_QUERY_KEY_PREFIX = 'project-temporal-workflows';

const normalizeValue = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase();

const getRequestedWorkflowTypes = (workflowType?: string | string[]) => {
  if (workflowType === undefined) {
    return [];
  }

  const rawWorkflowTypes = Array.isArray(workflowType)
    ? workflowType
    : [workflowType];
  const workflowTypesByKey = new Map<string, string>();

  for (const workflowTypeName of rawWorkflowTypes) {
    const workflowTypeKey = normalizeValue(workflowTypeName);

    if (
      workflowTypeKey.length === 0 ||
      workflowTypesByKey.has(workflowTypeKey)
    ) {
      continue;
    }

    workflowTypesByKey.set(workflowTypeKey, workflowTypeName);
  }

  return [...workflowTypesByKey.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([, workflowTypeName]) => workflowTypeName);
};

const mergeWorkflowTypes = (
  leftWorkflowTypes: string[],
  rightWorkflowType?: string | string[],
) => {
  const workflowTypesByKey = new Map<string, string>();
  const addWorkflowType = (workflowTypeName: string) => {
    const workflowTypeKey = normalizeValue(workflowTypeName);

    if (
      workflowTypeKey.length === 0 ||
      workflowTypesByKey.has(workflowTypeKey)
    ) {
      return;
    }

    workflowTypesByKey.set(workflowTypeKey, workflowTypeName);
  };

  for (const workflowTypeName of leftWorkflowTypes) {
    addWorkflowType(workflowTypeName);
  }

  if (Array.isArray(rightWorkflowType)) {
    for (const workflowTypeName of rightWorkflowType) {
      addWorkflowType(workflowTypeName);
    }
  } else if (rightWorkflowType !== undefined) {
    addWorkflowType(rightWorkflowType);
  }

  return [...workflowTypesByKey.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([, workflowTypeName]) => workflowTypeName);
};

const areWorkflowTypesEqual = (
  leftWorkflowTypes: string[],
  rightWorkflowTypes: string[],
) =>
  leftWorkflowTypes.length === rightWorkflowTypes.length &&
  leftWorkflowTypes.every(
    (leftWorkflowType, index) => leftWorkflowType === rightWorkflowTypes[index],
  );

const getMergedObservationTimestamp = (
  existingObservation: RunningWorkflowObservation | undefined,
  options: SetRunningWorkflowObservationOptions,
) => {
  if (options.observedAt !== undefined) {
    return options.observedAt;
  }

  if (existingObservation) {
    return existingObservation.observedAt;
  }

  return Date.now();
};

const getMergedObservationSummaryRefresh = (
  existingObservation: RunningWorkflowObservation | undefined,
  options: SetRunningWorkflowObservationOptions,
) => {
  if (existingObservation?.refetchNodeSummariesOnSuccess === false) {
    return false;
  }

  return options.refetchNodeSummariesOnSuccess !== false;
};

const getMergedObservationWorkflowTypes = (
  existingObservation: RunningWorkflowObservation | undefined,
  options: SetRunningWorkflowObservationOptions,
) =>
  mergeWorkflowTypes(
    existingObservation?.workflowTypes ?? [],
    options.workflowType,
  );

const mergeRunningWorkflowObservation = (
  existingObservation: RunningWorkflowObservation | undefined,
  options: SetRunningWorkflowObservationOptions,
): RunningWorkflowObservation => ({
  observedAt: getMergedObservationTimestamp(existingObservation, options),
  refetchNodeSummariesOnSuccess: getMergedObservationSummaryRefresh(
    existingObservation,
    options,
  ),
  workflowTypes: getMergedObservationWorkflowTypes(
    existingObservation,
    options,
  ),
});

const areRunningWorkflowObservationsEqual = (
  existingObservation: RunningWorkflowObservation | undefined,
  nextObservation: RunningWorkflowObservation,
) => {
  if (!existingObservation) {
    return false;
  }

  return (
    existingObservation.observedAt === nextObservation.observedAt &&
    existingObservation.refetchNodeSummariesOnSuccess ===
      nextObservation.refetchNodeSummariesOnSuccess &&
    areWorkflowTypesEqual(
      existingObservation.workflowTypes,
      nextObservation.workflowTypes,
    )
  );
};

const createOptimisticWorkflowObservation = (
  projectId: string,
  projectVersion: number,
  workflowId: string,
  workflowType: string,
  observedAt: number,
): WorkflowsBase => ({
  runId: `observed-${workflowId}-${workflowType}`,
  status: 'running',
  workflowId: workflowId,
  workflowStartTime: new Date(observedAt).toISOString(),
  workflowCloseTime: null,
  workflowType: workflowType,
  projectId: projectId,
  projectVersion: projectVersion,
  failure: null,
});

export const getWorkflowCollectionRequestKey = (
  request: WorkflowCollectionRequest = {},
) =>
  JSON.stringify([
    getRequestedWorkflowTypes(request.workflowType),
    request.workflowId,
    request.targetId,
    request.rootWorkflowId,
    request.rootRunId,
    request.executionStatus,
  ]);

export const getProjectTemporalWorkflowsCollectionQueryKey = (
  projectId: string,
  projectVersion: number,
  request?: WorkflowCollectionRequest,
) =>
  [
    WORKFLOW_COLLECTION_QUERY_KEY_PREFIX,
    projectId,
    projectVersion,
    getWorkflowCollectionRequestKey(request),
  ] as const;

/**
 * Status snapshots use exact targets rather than assuming a global page contains them.
 * @param projectId - Authorized project scope.
 * @param projectVersion - Selected project version.
 * @param request - Target/type/root selectors and optional status restriction.
 * @returns Distinct latest status snapshots, not a complete workflow history.
 */
const loadProjectTemporalWorkflows = async (
  projectId: string,
  projectVersion: number,
  request: WorkflowCollectionRequest = {},
): Promise<WorkflowsBase[]> => {
  const requestedTypes = getRequestedWorkflowTypes(request.workflowType);
  const workflowTypes =
    requestedTypes.length > 0 ? requestedTypes : [undefined];
  const statuses =
    request.executionStatus === undefined
      ? (['all', 'Running', 'Completed'] as const)
      : [request.executionStatus];
  const pages = await Promise.all(
    workflowTypes.flatMap((workflowType) => {
      let workflowId = request.workflowId;
      if (
        workflowId === undefined &&
        request.rootWorkflowId === undefined &&
        workflowType !== undefined
      ) {
        if (request.targetId !== undefined) {
          workflowId = getTargetWorkflowId({
            projectId,
            projectVersion,
            targetId: request.targetId,
            workflowType,
          });
        } else if (workflowType === 'FVPWorkflow') {
          workflowId = `${workflowType}-${projectId}-v${projectVersion}`;
        } else if (
          workflowType === 'FileProcessingWorkflow' ||
          workflowType === 'BatchMVPWorkflow'
        ) {
          workflowId = `${workflowType}-${projectId}`;
        }
      }
      return statuses.map(async (executionStatus) => {
        const query = {
          projectVersion,
          executionStatus,
          workflowId,
          pageSize: 1,
        };
        const { data } =
          workflowType === undefined
            ? await listTemporalWorkflows({
                query: { ...query, projectId },
                throwOnError: true,
              })
            : await listTemporalWorkflowsByType({
                path: { projectId },
                query: {
                  ...query,
                  workflowType,
                  rootWorkflowId: request.rootWorkflowId,
                  rootRunId: request.rootRunId,
                },
                throwOnError: true,
              });
        return data.workflows;
      });
    }),
  );
  return [
    ...new Map(
      pages
        .flat()
        .map((workflow) => [
          `${workflow.workflowId}:${workflow.runId}`,
          workflow,
        ]),
    ).values(),
  ];
};

const createProjectTemporalWorkflowsCollection = (
  projectId: string,
  projectVersion: number,
  request: WorkflowCollectionRequest = {},
) => {
  const options = queryCollectionOptions<WorkflowsBase>({
    autoIndex: 'eager',
    defaultIndexType: BasicIndex,
    enabled: true,
    id: `project-temporal-workflows-${projectId}-v${projectVersion}-${getWorkflowCollectionRequestKey(request)}`,
    persistedGcTime: Infinity,
    queryKey: getProjectTemporalWorkflowsCollectionQueryKey(
      projectId,
      projectVersion,
      request,
    ),
    queryFn: async (): Promise<WorkflowsBase[]> =>
      loadProjectTemporalWorkflows(projectId, projectVersion, request),
    queryClient,
    getKey: (workflow) => `${workflow.workflowId}:${workflow.runId}`,
    refetchInterval:
      request.executionStatus === 'Running'
        ? WORKFLOW_REFETCH_INTERVAL_MS
        : false,
    staleTime: 0,
  });

  // Keep fetched workflow subsets on their cached collections so revisiting a
  // previously opened workflow surface can render stale data immediately while
  // Query revalidates the same subset in the background.
  const originalSync = options.sync.sync;
  options.sync.sync = (params) => {
    const result = originalSync(params);

    return {
      ...result,
      unloadSubset: undefined,
    };
  };

  return createCollection(options);
};

const createProjectRunningTemporalWorkflowsCollection = (
  projectId: string,
  projectVersion: number,
  getWorkflowIds: () => string[],
) => {
  const options =
    queryCollectionOptions<V1TemporalJobsGetTemporalWorkflowResponse>({
      autoIndex: 'eager',
      defaultIndexType: BasicIndex,
      enabled: true,
      id: `project-running-temporal-workflows-${projectId}-v${projectVersion}`,
      queryKey: [
        WORKFLOW_COLLECTION_QUERY_KEY_PREFIX,
        projectId,
        projectVersion,
        RUNNING_WORKFLOWS_COLLECTION_KEY,
      ],
      queryFn: () =>
        Promise.all(
          getWorkflowIds().map(async (workflowId) => {
            const { data } = await getTemporalWorkflow({
              path: { workflowId },
              query: { includeResult: false },
              throwOnError: true,
            });
            return data;
          }),
        ),
      queryClient,
      getKey: (status) => status.workflowId,
      refetchInterval: WORKFLOW_REFETCH_INTERVAL_MS,
      staleTime: 0,
    });

  return createCollection(options);
};

/**
 * Reuses request-scoped workflow collections so matching workflow surfaces
 * share the same TanStack DB collection instances.
 *
 * @param projectId Project whose workflow subsets should be cached and refreshed.
 * @returns Helpers for cached collections, preloading, and refetching.
 */
// eslint-disable-next-line custom-size/limit-logic-function-lines -- the cached manager owns collection access plus the small running-workflow observation state for one project/version.
const createProjectTemporalWorkflowsManager = (
  projectId: string,
  projectVersion: number,
) => {
  const collectionCache = new Map<
    string,
    ReturnType<typeof createProjectTemporalWorkflowsCollection>
  >();
  let runningCollection:
    | ReturnType<typeof createProjectRunningTemporalWorkflowsCollection>
    | undefined;
  const runningWorkflowObservations = new Map<
    string,
    RunningWorkflowObservation
  >();
  const runningWorkflowObservationListeners = new Set<() => void>();
  let runningWorkflowObservationSnapshot: WorkflowsBase[] = [];

  const refreshRunningWorkflowObservationSnapshot = () => {
    runningWorkflowObservationSnapshot = Array.from(
      runningWorkflowObservations.entries(),
    ).flatMap(([workflowId, observation]) => {
      const workflowTypes =
        observation.workflowTypes.length > 0 ? observation.workflowTypes : [''];

      return workflowTypes.map((workflowType) =>
        createOptimisticWorkflowObservation(
          projectId,
          projectVersion,
          workflowId,
          workflowType,
          observation.observedAt,
        ),
      );
    });
  };

  const notifyRunningWorkflowObservationListeners = () => {
    refreshRunningWorkflowObservationSnapshot();

    for (const listener of runningWorkflowObservationListeners) {
      listener();
    }
  };

  const setRunningWorkflowObservation = (
    workflowId: string,
    options: SetRunningWorkflowObservationOptions = {},
  ) => {
    const existingObservation = runningWorkflowObservations.get(workflowId);
    const nextObservation = mergeRunningWorkflowObservation(
      existingObservation,
      options,
    );

    if (
      areRunningWorkflowObservationsEqual(existingObservation, nextObservation)
    ) {
      return false;
    }

    runningWorkflowObservations.set(workflowId, nextObservation);
    return true;
  };

  const getCollection = (request: WorkflowCollectionRequest = {}) => {
    const requestKey = getWorkflowCollectionRequestKey(request);
    const cachedCollection = collectionCache.get(requestKey);

    if (cachedCollection) {
      return cachedCollection;
    }

    const collection = createProjectTemporalWorkflowsCollection(
      projectId,
      projectVersion,
      request,
    );
    collectionCache.set(requestKey, collection);

    return collection;
  };
  const preloadCollection = (request?: WorkflowCollectionRequest) =>
    getCollection(request).preload();
  const refetchCollection = (request?: WorkflowCollectionRequest) =>
    getCollection(request).utils.refetch();
  const getRunningCollection = () => {
    if (runningCollection) {
      return runningCollection;
    }

    runningCollection = createProjectRunningTemporalWorkflowsCollection(
      projectId,
      projectVersion,
      () => [...runningWorkflowObservations.keys()],
    );
    return runningCollection;
  };
  const refetchRunningCollection = () => getRunningCollection().utils.refetch();
  const observeRunningWorkflow = (
    workflowId: string,
    options: {
      refetchNodeSummariesOnSuccess?: boolean;
      workflowType?: string | string[];
    } = {},
  ) => {
    const didChange = setRunningWorkflowObservation(workflowId, {
      refetchNodeSummariesOnSuccess: options.refetchNodeSummariesOnSuccess,
      workflowType: options.workflowType,
    });

    if (didChange) {
      notifyRunningWorkflowObservationListeners();
    }
  };
  const observeStartedWorkflow = (
    workflowId: string,
    options: {
      refetchNodeSummariesOnSuccess?: boolean;
      workflowType?: string | string[];
    } = {},
  ) => {
    const didChange = setRunningWorkflowObservation(workflowId, {
      observedAt: Date.now(),
      refetchNodeSummariesOnSuccess: options.refetchNodeSummariesOnSuccess,
      workflowType: options.workflowType,
    });

    if (didChange) {
      notifyRunningWorkflowObservationListeners();
    }

    return Promise.resolve(refetchRunningCollection()).catch(() => undefined);
  };
  /**
   * Only authoritative terminal status can settle a start never seen running.
   * @param statuses - Native metadata for each explicitly observed workflow ID.
   * @param newlyClosedWorkflows - Newly discovered project completions for summary refresh.
   * @returns Whether project summaries need one refresh after this reconciliation.
   */
  const reconcileRunningWorkflows = (
    statuses: V1TemporalJobsGetTemporalWorkflowResponse[],
    newlyClosedWorkflows?: WorkflowsBase[],
  ) => {
    const runningIds = new Set(
      statuses
        .filter(
          (workflow) =>
            workflow.status === 'running' || workflow.status === 'pending',
        )
        .map((workflow) => workflow.workflowId),
    );
    const closedIds = new Set(
      statuses
        .filter(
          (workflow) =>
            workflow.status !== null &&
            workflow.status !== 'running' &&
            workflow.status !== 'pending',
        )
        .map((workflow) => workflow.workflowId),
    );
    const shouldRefetchClosed =
      newlyClosedWorkflows?.some(
        (workflow) =>
          runningWorkflowObservations.get(workflow.workflowId)
            ?.refetchNodeSummariesOnSuccess ?? true,
      ) ?? false;
    let didChange = false;
    const completedObservations = Array.from(
      runningWorkflowObservations.entries(),
    ).filter(([workflowId]) => {
      if (runningIds.has(workflowId)) {
        return false;
      }

      return (
        newlyClosedWorkflows?.some(
          (workflow) => workflow.workflowId === workflowId,
        ) === true || closedIds.has(workflowId)
      );
    });

    for (const workflow of statuses) {
      if (!runningIds.has(workflow.workflowId)) {
        continue;
      }
      didChange =
        setRunningWorkflowObservation(workflow.workflowId, {
          workflowType: workflow.workflowType,
        }) || didChange;
    }

    for (const [workflowId] of completedObservations) {
      runningWorkflowObservations.delete(workflowId);
      didChange = true;
    }

    if (didChange) {
      notifyRunningWorkflowObservationListeners();
    }

    return (
      shouldRefetchClosed ||
      completedObservations.some(
        ([, observation]) => observation.refetchNodeSummariesOnSuccess,
      )
    );
  };
  const subscribeRunningWorkflowObservations = (listener: () => void) => {
    runningWorkflowObservationListeners.add(listener);

    return () => {
      runningWorkflowObservationListeners.delete(listener);
    };
  };
  const getRunningWorkflowObservations = () =>
    runningWorkflowObservationSnapshot;

  return {
    getCollection,
    getRunningCollection,
    getRunningWorkflowObservations,
    observeStartedWorkflow,
    observeRunningWorkflow,
    preload: preloadCollection,
    refetch: refetchCollection,
    refetchRunning: refetchRunningCollection,
    reconcileRunningWorkflows,
    subscribeRunningWorkflowObservations,
  };
};

const MANAGER_CACHE =
  createLruCache<ReturnType<typeof createProjectTemporalWorkflowsManager>>(10);

export const getProjectTemporalWorkflowsManager = (
  projectId: string,
  projectVersion: number,
) => {
  const cacheKey = `${projectId}:v${projectVersion}`;
  const cachedManager = MANAGER_CACHE.get(cacheKey);
  if (cachedManager) {
    return cachedManager;
  }

  const manager = createProjectTemporalWorkflowsManager(
    projectId,
    projectVersion,
  );
  MANAGER_CACHE.set(cacheKey, manager);

  return manager;
};
