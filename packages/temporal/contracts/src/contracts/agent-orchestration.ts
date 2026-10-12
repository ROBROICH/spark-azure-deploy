import type { WorkflowName } from "../registry.js";
import type { WorkflowFailureCode } from "../workflow-failure.js";
import type { DMSFileResponse } from "./document-management-temporal.js";

export const AGENT_ORCHESTRATION_TASK_QUEUE = "orchestration" as const;

export const AGENT_ORCHESTRATION_FPP_DOWNLOAD_WORKFLOW =
  "FPPDownloadWorkflow" as WorkflowName<"FPPDownloadWorkflow">;
export const AGENT_ORCHESTRATION_ISOLATED_FVP_WORKFLOW =
  "IsolatedFVPWorkflow" as WorkflowName<"IsolatedFVPWorkflow">;
export const AGENT_ORCHESTRATION_FVP_WORKFLOW = "FVPWorkflow" as WorkflowName<"FVPWorkflow">;
export const AGENT_ORCHESTRATION_INSERT_EXTRACTION_RESULTS_WORKFLOW =
  "InsertExtractionResultsWorkflow" as WorkflowName<"InsertExtractionResultsWorkflow">;
export const AGENT_ORCHESTRATION_MVP_WORKFLOW = "MVPWorkflow" as WorkflowName<"MVPWorkflow">;
export const AGENT_ORCHESTRATION_BATCH_MVP_WORKFLOW =
  "BatchMVPWorkflow" as WorkflowName<"BatchMVPWorkflow">;
export const AGENT_ORCHESTRATION_INSERT_RECHTSMETHODIK_RESULTS_WORKFLOW =
  "InsertRechtsmethodikResultsWorkflow" as WorkflowName<"InsertRechtsmethodikResultsWorkflow">;
export const AGENT_ORCHESTRATION_SUCHE_ZUORDNUNG_NORM_WORKFLOW =
  "suche_zuordnung_norm" as WorkflowName<"suche_zuordnung_norm">;
export const AGENT_ORCHESTRATION_INSERT_SUCHE_ZUORDNUNG_RESULTS_WORKFLOW =
  "InsertSucheZuordnungResultsWorkflow" as WorkflowName<"InsertSucheZuordnungResultsWorkflow">;
export const AGENT_ORCHESTRATION_BEWERTUNG_WORKFLOW = "bewertung" as WorkflowName<"bewertung">;
export const AGENT_ORCHESTRATION_PROCESS_BEWERTUNGEN_WORKFLOW =
  "ProcessBewertungenWorkflow" as WorkflowName<"ProcessBewertungenWorkflow">;
export const AGENT_ORCHESTRATION_INSERT_BEWERTUNG_RESULTS_WORKFLOW =
  "InsertBewertungResultsWorkflow" as WorkflowName<"InsertBewertungResultsWorkflow">;
export const AGENT_ORCHESTRATION_EWMS_ORCHESTRATOR_WORKFLOW =
  "EWMSOrchestratorWorkflow" as WorkflowName<"EWMSOrchestratorWorkflow">;
export const AGENT_ORCHESTRATION_EWMS_ENTRYPOINT_WORKFLOW =
  "EWMSEntrypointWorkflow" as WorkflowName<"EWMSEntrypointWorkflow">;
export const AGENT_ORCHESTRATION_RISIKOHINWEISE_WORKFLOW =
  "risikohinweise" as WorkflowName<"risikohinweise">;

export interface AgentOrchestrationFvpWorkflowInput {
  projectId: string;
}

export interface AgentOrchestrationFvpWorkflowOutput {
  checks: {
    workflowType: "formalpruefung" | "inhaltsverzeichnismatching" | "plausibilitaetspruefung";
    result: DMSFileResponse | null;
    error: string | null;
    errorCode: WorkflowFailureCode | null;
  }[];
}

export type AgentOrchestrationFvpWorkflow = (
  input: AgentOrchestrationFvpWorkflowInput,
) => Promise<AgentOrchestrationFvpWorkflowOutput>;
