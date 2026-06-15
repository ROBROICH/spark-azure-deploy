import type { WorkflowsBase } from '@/api-clients/temporal-jobs-module/types.gen';
import type {
  WorkflowBadgeStatus,
  WorkflowSummary,
  WorkflowTypeName,
} from './workflowStatus.types';

export const RUNNING_WORKFLOW_STATUSES = new Set([
  'running',
  'pending',
  'continued_as_new',
]);

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

export const normalizeWorkflowValue = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase();

const getWorkflowStartTime = (workflow: WorkflowsBase) => {
  const parsedTime = Date.parse(workflow.workflow_start_time ?? '');
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

  return right.workflow_id.localeCompare(left.workflow_id);
};

export const getWorkflowRunKey = (workflow: WorkflowsBase | undefined) => {
  if (!workflow) {
    return null;
  }

  return `${workflow.workflow_id}:${workflow.workflow_start_time ?? ''}`;
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

const getWorkflowBadgeStatus = (
  workflow: WorkflowsBase,
): WorkflowBadgeStatus => {
  const normalizedStatus = normalizeWorkflowValue(workflow.status);

  if (FAILED_WORKFLOW_STATUSES.has(normalizedStatus)) {
    return 'failed';
  }

  if (normalizedStatus === 'completed') {
    return 'success';
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

  return workflowTypeKeys.has(normalizeWorkflowValue(workflow.workflow_type));
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
    workflow.workflow_id,
    matchIdsInWorkflowId,
    workflowIdMatchValue,
  );
};

export const getWorkflowCollectionRequest = (args: {
  includeSubWorkflows?: boolean;
  workflowType?: WorkflowTypeName | WorkflowTypeName[];
}) =>
  args.includeSubWorkflows
    ? {
        workflowType: args.workflowType,
        includeChildren: true,
      }
    : {
        workflowType: args.workflowType,
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
    const workflowTypeKey = normalizeWorkflowValue(workflow.workflow_type);

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
