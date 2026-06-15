import type { WorkflowsBase } from '@/api-clients/temporal-jobs-module/types.gen';

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

export type WorkflowBadgeStatus = 'pending' | 'success' | 'failed';

export type WorkflowSummary = {
  workflow: WorkflowsBase;
  workflows: WorkflowsBase[];
  workflowTypeKey: string;
  isRunning: boolean;
  badgeStatus: WorkflowBadgeStatus;
};
