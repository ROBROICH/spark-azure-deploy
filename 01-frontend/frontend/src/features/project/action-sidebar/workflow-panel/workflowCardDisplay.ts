import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import type { StatusBadgeVariant } from '@/features/ui/status-badge/StatusBadge';
import { getTemporalWorkflowBaseUrl } from '@/features/shared/config/temporalUi';
import { formatDateTime } from '@/i18n/formatDate';
import {
  RUNNING_WORKFLOW_STATUSES,
  WORKFLOW_TYPE_BEWERTUNG,
  WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
  WORKFLOW_TYPE_CONTENT_EXTRACTION,
  WORKFLOW_TYPE_ENSURE_QDRANT,
  WORKFLOW_TYPE_EWMS,
  WORKFLOW_TYPE_FILE_PROCESSING,
  WORKFLOW_TYPE_FVP,
  WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING,
  WORKFLOW_TYPE_LLM_MATCHING,
  WORKFLOW_TYPE_PROCESS_DOCUMENTS,
  WORKFLOW_TYPE_RISIKOHINWEISE,
  WORKFLOW_TYPE_SUZ_NORM,
  normalizeWorkflowValue,
} from '@/features/workflow-runtime/workflow-status/workflowStatus.helpers';
import type { WorkflowBadgeStatus } from '@/features/workflow-runtime/workflow-status/workflowStatus.types';

export const WORKFLOW_STATUS_BADGE_VARIANT = {
  pending: 'warning',
  success: 'success',
  failed: 'error',
  continued: 'neutral',
} as const satisfies Record<WorkflowBadgeStatus, StatusBadgeVariant>;

export const WORKFLOW_STATUS_LABEL_KEY: Record<WorkflowBadgeStatus, string> = {
  pending: 'Sidebar.runningWorkflowsPanel.status.pending',
  success: 'Sidebar.runningWorkflowsPanel.status.success',
  failed: 'Sidebar.runningWorkflowsPanel.status.failed',
  continued: 'Sidebar.runningWorkflowsPanel.status.continued',
};

/**
 * Maps a normalized workflow type to a product-facing translation key so the UI
 * never surfaces raw Temporal workflow type names. Unmapped types fall back to
 * the generic "unknown workflow" label.
 *
 * Keys are normalized with {@link normalizeWorkflowValue} because the lookup in
 * {@link getWorkflowNameLabelKey} normalizes the incoming workflow type. Both
 * sides must match, otherwise mixed-case types (e.g. `FVPWorkflow`) silently
 * fall through to the unknown-workflow fallback.
 */
const WORKFLOW_NAME_LABEL_KEY_BY_TYPE: Partial<Record<string, string>> = {
  [normalizeWorkflowValue(WORKFLOW_TYPE_CONTENT_EXTRACTION)]:
    'Sidebar.runningWorkflowsPanel.workflowNames.contentExtraction',
  [normalizeWorkflowValue(WORKFLOW_TYPE_PROCESS_DOCUMENTS)]:
    'Sidebar.runningWorkflowsPanel.workflowNames.processDocuments',
  [normalizeWorkflowValue(WORKFLOW_TYPE_FILE_PROCESSING)]:
    'Sidebar.runningWorkflowsPanel.workflowNames.fileProcessing',
  [normalizeWorkflowValue(WORKFLOW_TYPE_FVP)]:
    'Sidebar.runningWorkflowsPanel.workflowNames.fvp',
  [normalizeWorkflowValue(WORKFLOW_TYPE_LLM_MATCHING)]:
    'Sidebar.runningWorkflowsPanel.workflowNames.documentMatching',
  [normalizeWorkflowValue(WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING)]:
    'Sidebar.runningWorkflowsPanel.workflowNames.tableOfContents',
  [normalizeWorkflowValue(WORKFLOW_TYPE_CHECK_PLAUSIBILITY)]:
    'Sidebar.runningWorkflowsPanel.workflowNames.plausibility',
  [normalizeWorkflowValue(WORKFLOW_TYPE_SUZ_NORM)]:
    'Sidebar.runningWorkflowsPanel.workflowNames.normAssignment',
  [normalizeWorkflowValue(WORKFLOW_TYPE_BEWERTUNG)]:
    'Sidebar.runningWorkflowsPanel.workflowNames.assessment',
  [normalizeWorkflowValue(WORKFLOW_TYPE_RISIKOHINWEISE)]:
    'Sidebar.runningWorkflowsPanel.workflowNames.riskWarnings',
  [normalizeWorkflowValue(WORKFLOW_TYPE_ENSURE_QDRANT)]:
    'Sidebar.runningWorkflowsPanel.workflowNames.indexing',
  [normalizeWorkflowValue(WORKFLOW_TYPE_EWMS)]:
    'Sidebar.runningWorkflowsPanel.workflowNames.ewmsExport',
};

/**
 * Returns the product-facing translation key for a workflow, derived from its
 * normalized type. Falls back to the generic unknown-workflow label so the raw
 * Temporal type name is never rendered.
 *
 * @param workflow The workflow whose type should be resolved to a label key.
 * @returns A translation key for the workflow's product-facing name.
 */
export const getWorkflowNameLabelKey = (workflow: WorkflowsBase): string =>
  WORKFLOW_NAME_LABEL_KEY_BY_TYPE[
    normalizeWorkflowValue(workflow.workflowType)
  ] ?? 'Sidebar.runningWorkflowsPanel.unknownWorkflowType';

const getTimestampValue = (value: string | null | undefined) => {
  const parsedValue = Date.parse(value ?? '');
  return Number.isNaN(parsedValue) ? null : parsedValue;
};

export const formatWorkflowTimestamp = (
  value: string | null | undefined,
  locale: string,
  fallbackValue: string,
) => {
  const timestamp = getTimestampValue(value);
  if (timestamp === null) {
    return fallbackValue;
  }

  return formatDateTime(new Date(timestamp).toISOString(), locale);
};

export const formatWorkflowDuration = (
  durationMs: number | null,
  fallbackValue: string,
) => {
  if (durationMs === null) {
    return fallbackValue;
  }

  const safeDurationMs = Math.max(durationMs, 0);
  const totalSeconds = Math.floor(safeDurationMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const timeValue = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');

  if (days === 0) {
    return timeValue;
  }

  return `${days}d ${timeValue}`;
};

export const getWorkflowDurationMs = (args: {
  isRunning: boolean;
  now: number;
  workflow: WorkflowsBase;
}) => {
  const { isRunning, now, workflow } = args;
  const startTimestamp = getTimestampValue(workflow.workflowStartTime);

  if (startTimestamp === null) {
    return null;
  }

  const endTimestamp = isRunning
    ? now
    : getTimestampValue(workflow.workflowCloseTime);

  if (endTimestamp === null) {
    return null;
  }

  return endTimestamp - startTimestamp;
};

export const isWorkflowRunning = (workflow: WorkflowsBase) =>
  RUNNING_WORKFLOW_STATUSES.has(normalizeWorkflowValue(workflow.status));

export const getTemporalWorkflowTimelineUrl = (workflow: WorkflowsBase) => {
  const workflowId = encodeURIComponent(workflow.workflowId);
  const runId = encodeURIComponent(workflow.runId);

  return `${getTemporalWorkflowBaseUrl()}/${workflowId}/${runId}`;
};
