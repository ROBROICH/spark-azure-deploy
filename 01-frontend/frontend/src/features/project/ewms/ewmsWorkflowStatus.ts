import type { WorkflowsBase } from '@/api-clients/temporal-jobs-module/types.gen';
import {
  normalizeWorkflowValue,
  RUNNING_WORKFLOW_STATUSES,
  WORKFLOW_TYPE_EWMS,
} from '@/features/workflow-runtime/workflow-status/workflowStatus.helpers';

export type EwmsViewState = 'landing' | 'processing' | 'workspace';

export type EwmsWorkflowTreeNode = {
  children?: EwmsWorkflowTreeNode[];
  status?: string | null;
  workflow_id: string;
  workflow_start_time?: string | null;
  workflow_type: string;
};

export const resolveEwmsViewState = (params: {
  hasFirstSwimlaneData: boolean;
  isWorkflowRunning: boolean;
}): EwmsViewState => {
  const { hasFirstSwimlaneData, isWorkflowRunning } = params;

  if (isWorkflowRunning) {
    return hasFirstSwimlaneData ? 'workspace' : 'processing';
  }

  if (hasFirstSwimlaneData) {
    return 'workspace';
  }

  return 'landing';
};

const isEwmsWorkflowNode = (workflow: EwmsWorkflowTreeNode) =>
  normalizeWorkflowValue(workflow.workflow_type) ===
  normalizeWorkflowValue(WORKFLOW_TYPE_EWMS);

export const isRunningEwmsWorkflowStatus = (
  status: string | null | undefined,
) => RUNNING_WORKFLOW_STATUSES.has(normalizeWorkflowValue(status));

const collectWorkflowTreeNodes = (
  workflows: ReadonlyArray<EwmsWorkflowTreeNode>,
) => {
  const collected: EwmsWorkflowTreeNode[] = [];

  /**
   * Walks badly nested EWMS child workflow trees depth-first so orchestrator
   * candidates are found even when they are not direct FileProcessing children.
   */
  const visit = (workflow: EwmsWorkflowTreeNode) => {
    collected.push(workflow);

    for (const child of workflow.children ?? []) {
      visit(child);
    }
  };

  for (const workflow of workflows) {
    visit(workflow);
  }

  return collected;
};

export const getRunningEwmsWorkflowCandidates = (
  workflows: ReadonlyArray<EwmsWorkflowTreeNode>,
) =>
  collectWorkflowTreeNodes(workflows).filter(
    (workflow) =>
      isEwmsWorkflowNode(workflow) &&
      isRunningEwmsWorkflowStatus(workflow.status),
  );

const getWorkflowStartTimeMs = (workflow: EwmsWorkflowTreeNode) => {
  const timestamp = Date.parse(workflow.workflow_start_time ?? '');

  return Number.isNaN(timestamp) ? null : timestamp;
};

export const getLatestRunningEwmsWorkflow = (
  workflows: ReadonlyArray<WorkflowsBase>,
) =>
  workflows.reduce<WorkflowsBase | undefined>((latest, workflow) => {
    if (!latest) {
      return workflow;
    }

    const latestStartTime = getWorkflowStartTimeMs(latest);
    const workflowStartTime = getWorkflowStartTimeMs(workflow);

    if (latestStartTime !== null && workflowStartTime !== null) {
      return workflowStartTime > latestStartTime ? workflow : latest;
    }

    return workflow;
  }, undefined);
