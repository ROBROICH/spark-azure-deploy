import type { ChildWorkflowInfo } from '@/api-clients/temporal-jobs-module/types.gen';
import type { WorkflowTypeName } from './workflowStatus.types';
import type { useWorkflow } from './useWorkflow';
import {
  FAILED_WORKFLOW_STATUSES,
  RUNNING_WORKFLOW_STATUSES,
} from './workflowStatus.helpers';

type WorkflowTreeNode = {
  workflow_id: string;
  workflow_type: string;
  status?: string | null;
  workflow_start_time?: string | null;
  children?: WorkflowTreeNode[] | ChildWorkflowInfo[];
};

type WorkflowState = ReturnType<typeof useWorkflow>;

type SubWorkflowTypeOption = WorkflowTypeName | WorkflowTypeName[];

const normalizeValue = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase();

const getWorkflowTypeKeys = (workflowType: SubWorkflowTypeOption) => {
  const workflowTypes = Array.isArray(workflowType)
    ? workflowType
    : [workflowType];

  return new Set(
    workflowTypes
      .map((value) => normalizeValue(value))
      .filter((value) => value.length > 0),
  );
};

const collectWorkflowNodes = (
  workflows: ReadonlyArray<WorkflowTreeNode>,
): WorkflowTreeNode[] => {
  const collected: WorkflowTreeNode[] = [];

  /**
   * Walks nested child workflows depth-first so sub-workflow status can be
   * derived from the full child execution tree of the latest main workflow.
   */
  const visit = (node: WorkflowTreeNode) => {
    collected.push(node);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  for (const workflow of workflows) {
    visit(workflow);
  }

  return collected;
};

const getWorkflowStartTime = (workflow: WorkflowTreeNode) => {
  const parsedTime = Date.parse(workflow.workflow_start_time ?? '');
  return Number.isNaN(parsedTime) ? null : parsedTime;
};

const getSubWorkflowRunKey = (workflow: WorkflowTreeNode | undefined) => {
  if (!workflow) {
    return null;
  }

  return `${workflow.workflow_id}:${workflow.workflow_start_time ?? ''}`;
};

const getLatestWorkflowNode = (workflows: ReadonlyArray<WorkflowTreeNode>) => {
  return workflows.reduce<
    { traversalIndex: number; workflow: WorkflowTreeNode } | undefined
  >((latestWorkflowNode, workflow, traversalIndex) => {
    if (!latestWorkflowNode) {
      return {
        traversalIndex,
        workflow,
      };
    }

    const latestWorkflowStartTime = getWorkflowStartTime(
      latestWorkflowNode.workflow,
    );
    const workflowStartTime = getWorkflowStartTime(workflow);

    if (
      latestWorkflowStartTime !== null &&
      workflowStartTime !== null &&
      latestWorkflowStartTime !== workflowStartTime
    ) {
      return workflowStartTime > latestWorkflowStartTime
        ? {
            traversalIndex,
            workflow,
          }
        : latestWorkflowNode;
    }

    // Child workflow payloads do not consistently expose typed start times, so
    // fall back to later traversal order instead of locking onto the first match.
    return traversalIndex > latestWorkflowNode.traversalIndex
      ? {
          traversalIndex,
          workflow,
        }
      : latestWorkflowNode;
  }, undefined)?.workflow;
};

export const getSubWorkflowStateFromWorkflowState = (args: {
  subWorkflowType: WorkflowTypeName | WorkflowTypeName[];
  workflowState: WorkflowState;
}) => {
  const { subWorkflowType, workflowState } = args;
  const workflowTypeKeys = getWorkflowTypeKeys(subWorkflowType);
  const subWorkflows = collectWorkflowNodes(workflowState.subWorkflows).filter(
    (workflow) => workflowTypeKeys.has(normalizeValue(workflow.workflow_type)),
  );
  const latestSubWorkflow = getLatestWorkflowNode(subWorkflows);
  const latestSubWorkflowStatus = normalizeValue(latestSubWorkflow?.status);
  const isMainWorkflowRunning =
    workflowState.latestWorkflow !== undefined &&
    RUNNING_WORKFLOW_STATUSES.has(
      normalizeValue(workflowState.latestWorkflow.status),
    );
  const isMainWorkflowLoading =
    workflowState.isLoading || isMainWorkflowRunning;
  const hasAnyRun = subWorkflows.length > 0;
  const isRunning = subWorkflows.some((workflow) =>
    RUNNING_WORKFLOW_STATUSES.has(normalizeValue(workflow.status)),
  );
  const isLoading = isRunning || (!hasAnyRun && isMainWorkflowLoading);
  const isDone =
    hasAnyRun &&
    subWorkflows.every(
      (workflow) => normalizeValue(workflow.status) === 'completed',
    );
  const isFailed = FAILED_WORKFLOW_STATUSES.has(latestSubWorkflowStatus);
  const hasSuccessfulRun = subWorkflows.some(
    (workflow) => normalizeValue(workflow.status) === 'completed',
  );
  const subWorkflowRunKey = getSubWorkflowRunKey(latestSubWorkflow);

  return {
    workflowState,
    subWorkflows,
    latestSubWorkflow,
    hasAnyRun,
    hasSuccessfulRun,
    isRunning,
    isLoading,
    isDone,
    isFailed,
    isLastRunError: isFailed,
    isError: workflowState.isError,
    latestSubWorkflowStatus,
    subWorkflowRunKey,
  };
};
