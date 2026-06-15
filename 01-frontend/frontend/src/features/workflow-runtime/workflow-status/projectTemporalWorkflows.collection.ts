/* eslint-disable max-lines -- workflow collection setup keeps related Temporal loaders, collection factories, and the cached project manager in one module. */
import {
  getWorkflowTemporalWorkflowsWorkflowIdGet,
  getWorkflowsByTypeTemporalWorkflowsProjectIdByTypeGet,
  getWorkflowsTemporalWorkflowsGet,
} from '@/api-clients/temporal-jobs-module';
import type {
  GetWorkflowResponse,
  WorkflowsBase,
} from '@/api-clients/temporal-jobs-module/types.gen';
import { createLruCache } from '@/db/nodes/lruCache';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { BasicIndex, createCollection } from '@tanstack/react-db';

const WORKFLOW_REFETCH_INTERVAL_MS = 30_000;
const RUNNING_WORKFLOWS_COLLECTION_KEY = '__running__';
const STARTED_WORKFLOW_DISCOVERY_GRACE_MS = 10_000;

export type WorkflowCollectionRequest = {
  includeChildren?: boolean;
  workflowType?: string | string[];
};

type RunningWorkflowObservation = {
  hasBeenSeenRunning: boolean;
  observedAt: number;
  refetchNodeSummariesOnSuccess: boolean;
  workflowTypes: string[];
};

type SetRunningWorkflowObservationOptions = {
  hasBeenSeenRunning?: boolean;
  observedAt?: number;
  refetchNodeSummariesOnSuccess?: boolean;
  workflowType?: string | string[];
};

const ALL_WORKFLOW_TYPES_KEY = '__all__';
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

const getMergedObservationSeenState = (
  existingObservation: RunningWorkflowObservation | undefined,
  options: SetRunningWorkflowObservationOptions,
) =>
  existingObservation?.hasBeenSeenRunning === true ||
  options.hasBeenSeenRunning === true;

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
  hasBeenSeenRunning: getMergedObservationSeenState(
    existingObservation,
    options,
  ),
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
    existingObservation.hasBeenSeenRunning ===
      nextObservation.hasBeenSeenRunning &&
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
  workflowId: string,
  workflowType: string,
  observedAt: number,
): WorkflowsBase => ({
  run_id: `observed-${workflowId}-${workflowType}`,
  status: 'running',
  workflow_id: workflowId,
  workflow_start_time: new Date(observedAt).toISOString(),
  workflow_type: workflowType,
});

export const getWorkflowCollectionRequestKey = (
  request: WorkflowCollectionRequest = {},
) => {
  const workflowTypes = getRequestedWorkflowTypes(request.workflowType);

  if (workflowTypes.length === 0) {
    return request.includeChildren
      ? `${ALL_WORKFLOW_TYPES_KEY}:children`
      : ALL_WORKFLOW_TYPES_KEY;
  }

  const workflowTypesKey = workflowTypes
    .map((workflowType) => normalizeValue(workflowType))
    .join('|');

  return request.includeChildren
    ? `${workflowTypesKey}:children`
    : workflowTypesKey;
};

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

const toProjectWorkflow = (
  projectId: string,
  workflow: WorkflowsBase,
  detail?: GetWorkflowResponse,
): WorkflowsBase => ({
  ...workflow,
  project_id: workflow.project_id ?? projectId,
  workflow_type: detail?.workflow_type ?? workflow.workflow_type,
  workflow_start_time:
    detail?.workflow_start_time ?? workflow.workflow_start_time,
  workflow_close_time:
    detail?.workflow_close_time ?? workflow.workflow_close_time,
  status: detail?.status ?? workflow.status,
  children: detail?.children ?? workflow.children,
});

const loadWorkflowDetail = async (
  projectId: string,
  workflow: WorkflowsBase,
): Promise<WorkflowsBase> => {
  try {
    const { data } = await getWorkflowTemporalWorkflowsWorkflowIdGet({
      path: {
        workflow_id: workflow.workflow_id,
      },
      throwOnError: true,
    });

    return toProjectWorkflow(projectId, workflow, data);
  } catch {
    return toProjectWorkflow(projectId, workflow);
  }
};

const loadProjectTemporalWorkflowsByType = async (
  projectId: string,
  projectVersion: number,
  workflowType: string,
  includeChildren: boolean,
) => {
  const { data } = await getWorkflowsByTypeTemporalWorkflowsProjectIdByTypeGet({
    path: {
      project_id: projectId,
    },
    query: {
      workflow_type: workflowType,
      include_children: includeChildren,
      project_version: projectVersion,
    },
    throwOnError: true,
  });

  return data.workflows;
};

const loadProjectTemporalWorkflows = async (
  projectId: string,
  projectVersion: number,
  request: WorkflowCollectionRequest = {},
): Promise<WorkflowsBase[]> => {
  const includeChildren = request.includeChildren === true;
  const requestedWorkflowTypes = getRequestedWorkflowTypes(
    request.workflowType,
  );
  if (requestedWorkflowTypes.length === 0) {
    const { data } = await getWorkflowsTemporalWorkflowsGet({
      query: {
        execution_status: 'all',
        project_id: projectId,
        project_version: projectVersion,
      },
      throwOnError: true,
    });

    if (!includeChildren) {
      return data.workflows.map((workflow) =>
        toProjectWorkflow(projectId, workflow),
      );
    }

    return Promise.all(
      data.workflows.map((workflow) => loadWorkflowDetail(projectId, workflow)),
    );
  }

  const workflows = (
    await Promise.all(
      requestedWorkflowTypes.map((workflowType) =>
        loadProjectTemporalWorkflowsByType(
          projectId,
          projectVersion,
          workflowType,
          includeChildren,
        ),
      ),
    )
  ).flat();

  return workflows.map((workflow) => toProjectWorkflow(projectId, workflow));
};

const loadProjectRunningTemporalWorkflows = async (
  projectId: string,
  projectVersion: number,
): Promise<WorkflowsBase[]> => {
  const { data } = await getWorkflowsTemporalWorkflowsGet({
    query: {
      execution_status: 'Running',
      project_id: projectId,
      project_version: projectVersion,
    },
    throwOnError: true,
  });

  return data.workflows.map((workflow) =>
    toProjectWorkflow(projectId, workflow),
  );
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
    getKey: (workflow) => `${workflow.workflow_id}:${workflow.run_id}`,
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
) => {
  const options = queryCollectionOptions<WorkflowsBase>({
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
    queryFn: async (): Promise<WorkflowsBase[]> =>
      loadProjectRunningTemporalWorkflows(projectId, projectVersion),
    queryClient,
    getKey: (workflow) => `${workflow.workflow_id}:${workflow.run_id}`,
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
      hasBeenSeenRunning: true,
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
  const reconcileRunningWorkflows = (runningWorkflows: WorkflowsBase[]) => {
    const runningWorkflowIds = new Set(
      runningWorkflows.map((workflow) => workflow.workflow_id),
    );
    const now = Date.now();
    let didChange = false;
    const completedObservations = Array.from(
      runningWorkflowObservations.entries(),
    ).filter(([workflowId, observation]) => {
      if (runningWorkflowIds.has(workflowId)) {
        return false;
      }

      return (
        observation.hasBeenSeenRunning ||
        now - observation.observedAt >= STARTED_WORKFLOW_DISCOVERY_GRACE_MS
      );
    });

    for (const workflow of runningWorkflows) {
      didChange =
        setRunningWorkflowObservation(workflow.workflow_id, {
          hasBeenSeenRunning: true,
          workflowType: workflow.workflow_type,
        }) || didChange;
    }

    for (const [workflowId] of completedObservations) {
      runningWorkflowObservations.delete(workflowId);
      didChange = true;
    }

    if (didChange) {
      notifyRunningWorkflowObservationListeners();
    }

    return completedObservations.some(
      ([, observation]) => observation.refetchNodeSummariesOnSuccess,
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
