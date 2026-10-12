import type { WorkflowsBase } from '@/api-clients/backend/types.gen';

export type KnownWorkflowTypeName =
  | 'InsertExtractionResultsWorkflow'
  | 'process-documents-workflow'
  | 'FVPWorkflow'
  | 'LLMMatchingWorkflow'
  | 'InhaltsverzeichnisMatchingWorkflow'
  | 'PlausibilityMainOrchestratorWorkflow'
  | 'suche_zuordnung_norm'
  | 'BewertungOrchestratorWorkflow'
  | 'ensure-qdrant-workflow'
  | 'EWMSOrchestratorWorkflow'
  | 'FileProcessingWorkflow';

export type WorkflowTypeName = KnownWorkflowTypeName | (string & {});

export type WorkflowBadgeStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'continued';

export type WorkflowFailure = NonNullable<WorkflowsBase['failure']>;

export type WorkflowFailureCode = WorkflowFailure['errorCode'];

export type WorkflowSummary = {
  workflow: WorkflowsBase;
  workflows: WorkflowsBase[];
  workflowTypeKey: string;
  isRunning: boolean;
  badgeStatus: WorkflowBadgeStatus;
};

export type WorkflowState = {
  workflows: WorkflowsBase[];
  latestWorkflow: WorkflowsBase | undefined;
  latestWorkflowsByType: WorkflowSummary[];
  hasAnyRun: boolean;
  hasSuccessfulRun: boolean;
  isRunning: boolean;
  /** The latest run's failure; `null` while a matching run is active. */
  latestFailure: WorkflowFailure | null;
  isLastRunError: boolean;
  isLastRunSuccessful: boolean;
  isDone: boolean;
  isFailed: boolean;
  isLoading: boolean;
  isError: boolean;
};
