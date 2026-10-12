import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import type {
  WorkflowBadgeStatus,
  WorkflowFailure,
  WorkflowSummary,
  WorkflowTypeName,
} from './workflowStatus.types';

export const RUNNING_WORKFLOW_STATUSES = new Set(['running', 'pending']);

export const FAILED_WORKFLOW_STATUSES = new Set([
  'failed',
  'canceled',
  'terminated',
  'timed_out',
]);

export const WORKFLOW_TYPE_CONTENT_EXTRACTION =
  'InsertExtractionResultsWorkflow';
export const WORKFLOW_TYPE_PROCESS_DOCUMENTS = 'process-documents-workflow';
export const WORKFLOW_TYPE_FVP = 'FVPWorkflow';
export const WORKFLOW_TYPE_LLM_MATCHING = 'LLMMatchingWorkflow';
export const WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING =
  'InhaltsverzeichnisMatchingWorkflow';
export const WORKFLOW_TYPE_CHECK_PLAUSIBILITY =
  'PlausibilityMainOrchestratorWorkflow';
export const WORKFLOW_TYPE_SUZ_NORM = 'suche_zuordnung_norm';
export const WORKFLOW_TYPE_BEWERTUNG = 'bewertung';
export const WORKFLOW_TYPE_ENSURE_QDRANT = 'ensure-qdrant-workflow';
export const WORKFLOW_TYPE_EWMS = 'EWMSOrchestratorWorkflow';
export const WORKFLOW_TYPE_FILE_PROCESSING = 'FileProcessingWorkflow';
export const WORKFLOW_TYPE_RISIKOHINWEISE = 'risikohinweise';

// Mirrors the backend `workflowId` builder
// (`agent_orchestration_service/src/temporal/workflow-id.ts`) for runs per norm
// or outline node.
export const getTargetWorkflowId = (args: {
  projectId: string;
  projectVersion: number;
  targetId: string;
  workflowType: string;
}) =>
  `${args.workflowType}-${args.projectId}-v${args.projectVersion}-${args.targetId}`;

export const normalizeWorkflowValue = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase();

// A failed run without failure details still needs a user-facing cause, so it
// falls back to the generic catalog code.
const UNKNOWN_WORKFLOW_FAILURE: WorkflowFailure = {
  errorCode: 'ANALYSIS_FAILED',
  branches: [],
};

/**
 * @param run - One workflow run, or `undefined` when there is none.
 * @returns The run's failure when it failed, was canceled, terminated, or timed out; otherwise `null`.
 */
export const getRunFailure = (
  run: WorkflowsBase | undefined,
): WorkflowFailure | null =>
  run !== undefined &&
  FAILED_WORKFLOW_STATUSES.has(normalizeWorkflowValue(run.status))
    ? (run.failure ?? UNKNOWN_WORKFLOW_FAILURE)
    : null;

export const toWorkflowStatus = (
  value: string | null | undefined,
): WorkflowsBase['status'] => {
  const status = normalizeWorkflowValue(value);
  if (status === 'running') {
    return 'running';
  }
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'failed') {
    return 'failed';
  }
  if (status === 'canceled') {
    return 'canceled';
  }
  if (status === 'terminated') {
    return 'terminated';
  }
  if (status === 'timed_out') {
    return 'timed_out';
  }
  if (status === 'continued_as_new') {
    return 'continued_as_new';
  }
  if (status === 'pending') {
    return 'pending';
  }
  return null;
};

const getWorkflowStartTime = (workflow: WorkflowsBase) => {
  const parsedTime = Date.parse(workflow.workflowStartTime ?? '');
  return Number.isNaN(parsedTime) ? 0 : parsedTime;
};

const sortWorkflowsNewestFirst = (
  left: WorkflowsBase,
  right: WorkflowsBase,
) => {
  const timeDifference =
    getWorkflowStartTime(right) - getWorkflowStartTime(left);
  if (timeDifference !== 0) {
    return timeDifference;
  }

  return right.workflowId.localeCompare(left.workflowId);
};

export const getWorkflowRunKey = (workflow: WorkflowsBase | undefined) => {
  if (!workflow) {
    return null;
  }

  return `${workflow.workflowId}:${workflow.workflowStartTime ?? ''}`;
};

const getWorkflowIdWithoutApiPrefix = (workflowId: string) => {
  const [, ...workflowIdParts] = workflowId.split('-');
  return workflowIdParts.join('-');
};

const getWorkflowIdMatchValue = (matchIdsInWorkflowId: string[]) => {
  if (
    matchIdsInWorkflowId.length === 0 ||
    matchIdsInWorkflowId.some((id) => id.length === 0)
  ) {
    return null;
  }

  return matchIdsInWorkflowId.join('-');
};

const escapeRegExp = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const getWorkflowIdWithoutProjectVersion = (
  workflowId: string,
  matchIdsInWorkflowId: string[],
) => {
  const projectId = matchIdsInWorkflowId.at(0);

  if (!projectId) {
    return workflowId;
  }

  return workflowId.replace(
    new RegExp(`(^|-)${escapeRegExp(projectId)}-v\\d+(?=-|$)`),
    `$1${projectId}`,
  );
};

const hasWorkflowIdMatchValue = (
  workflowId: string,
  matchIdsInWorkflowId: string[],
  workflowIdMatchValue: string,
) => {
  const workflowIdWithoutApiPrefix = getWorkflowIdWithoutProjectVersion(
    getWorkflowIdWithoutApiPrefix(workflowId),
    matchIdsInWorkflowId,
  );

  return (
    workflowIdWithoutApiPrefix === workflowIdMatchValue ||
    workflowIdWithoutApiPrefix.endsWith(`-${workflowIdMatchValue}`)
  );
};

/**
 * A continued execution is closed; its successor owns any ongoing work.
 * @param workflow - Native execution metadata for the displayed run.
 * @returns The run's lifecycle badge, independent of successor execution state.
 */
export const getWorkflowBadgeStatus = (
  workflow: WorkflowsBase,
): WorkflowBadgeStatus => {
  const normalizedStatus = normalizeWorkflowValue(workflow.status);

  if (FAILED_WORKFLOW_STATUSES.has(normalizedStatus)) {
    return 'failed';
  }

  if (normalizedStatus === 'completed') {
    return 'success';
  }

  if (normalizedStatus === 'continued_as_new') {
    return 'continued';
  }

  return 'pending';
};

const getWorkflowSummaryBadgeStatus = (
  latestWorkflow: WorkflowsBase,
  workflows: WorkflowsBase[],
): WorkflowBadgeStatus => {
  if (
    workflows.some((workflow) =>
      RUNNING_WORKFLOW_STATUSES.has(normalizeWorkflowValue(workflow.status)),
    )
  ) {
    return 'pending';
  }

  return getWorkflowBadgeStatus(latestWorkflow);
};

const getWorkflowTypeKeys = (
  workflowType: WorkflowTypeName | WorkflowTypeName[] | undefined,
) => {
  if (workflowType === undefined) {
    return new Set<string>();
  }

  const workflowTypes = Array.isArray(workflowType)
    ? workflowType
    : [workflowType];

  return new Set(
    workflowTypes
      .map((value) => normalizeWorkflowValue(value))
      .filter((value) => value.length > 0),
  );
};

const matchesWorkflowType = (
  workflow: WorkflowsBase,
  workflowTypeKeys: Set<string>,
) => {
  if (workflowTypeKeys.size === 0) {
    return true;
  }

  return workflowTypeKeys.has(normalizeWorkflowValue(workflow.workflowType));
};

const matchesWorkflowId = (
  workflow: WorkflowsBase,
  matchIdsInWorkflowId: string[],
) => {
  const workflowIdMatchValue = getWorkflowIdMatchValue(matchIdsInWorkflowId);
  if (workflowIdMatchValue === null) {
    return true;
  }

  return hasWorkflowIdMatchValue(
    workflow.workflowId,
    matchIdsInWorkflowId,
    workflowIdMatchValue,
  );
};

export const getWorkflowCollectionRequest = (args: {
  matchIdsInWorkflowId?: string[];
  workflowType?: WorkflowTypeName | WorkflowTypeName[];
}) => {
  const targetIds = args.matchIdsInWorkflowId?.slice(1) ?? [];
  return {
    workflowType: args.workflowType,
    targetId: targetIds.length > 0 ? targetIds.join('-') : undefined,
  };
};

export const getMatchingWorkflows = (args: {
  matchIdsInWorkflowId?: string[];
  workflowType?: WorkflowTypeName | WorkflowTypeName[];
  workflows: WorkflowsBase[];
}) => {
  const workflowTypeKeys = getWorkflowTypeKeys(args.workflowType);

  return [...args.workflows]
    .filter((workflow) => matchesWorkflowType(workflow, workflowTypeKeys))
    .filter((workflow) =>
      matchesWorkflowId(workflow, args.matchIdsInWorkflowId ?? []),
    )
    .sort(sortWorkflowsNewestFirst);
};

export const getLatestWorkflowsByType = (
  workflows: WorkflowsBase[],
): WorkflowSummary[] => {
  const workflowsByType = new Map<string, WorkflowsBase[]>();

  [...workflows].sort(sortWorkflowsNewestFirst).forEach((workflow) => {
    const workflowTypeKey = normalizeWorkflowValue(workflow.workflowType);

    if (workflowTypeKey.length === 0) {
      return;
    }

    const workflowsForType = workflowsByType.get(workflowTypeKey);
    if (workflowsForType) {
      workflowsForType.push(workflow);
      return;
    }

    workflowsByType.set(workflowTypeKey, [workflow]);
  });

  return [...workflowsByType.entries()].flatMap(
    ([workflowTypeKey, workflowsForType]) => {
      const [latestWorkflow] = workflowsForType;
      if (!latestWorkflow) {
        return [];
      }

      return {
        workflow: latestWorkflow,
        workflows: workflowsForType,
        workflowTypeKey,
        isRunning: workflowsForType.some((workflow) =>
          RUNNING_WORKFLOW_STATUSES.has(
            normalizeWorkflowValue(workflow.status),
          ),
        ),
        badgeStatus: getWorkflowSummaryBadgeStatus(
          latestWorkflow,
          workflowsForType,
        ),
      };
    },
  );
};
