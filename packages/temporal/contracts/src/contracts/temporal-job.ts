import type { WorkflowName } from "../registry.js";

export const TEMPORAL_JOB_TASK_QUEUE = "temporal-job-service" as const;
export const TEMPORAL_JOB_WEEKLY_ARCHIVAL_WORKFLOW =
  "WeeklyArchivalWorkflow" as WorkflowName<"WeeklyArchivalWorkflow">;
