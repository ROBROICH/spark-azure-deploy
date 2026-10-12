import type { WorkflowName } from "../registry.js";

export const ANONYMISIERUNG_TASK_QUEUE = "anonymisierung" as const;
export const ANONYMISIERUNG_WORKFLOW =
  "anonymisierung-redaction" as WorkflowName<"anonymisierung-redaction">;
