import { Type, type Static } from "@sinclair/typebox";

import { UUID, type WorkflowName } from "../registry.js";

export const PROJECT_INITIALIZATION_TASK_QUEUE = "project_logic_service" as const;
export const PROJECT_INITIALIZATION_WORKFLOW =
  "ProjectInitializationWorkflow" as WorkflowName<"ProjectInitializationWorkflow">;

const contracts = Type.Module({
  ProjectInitializationTemporalInput: Type.Object({
    workflowName: Type.Literal(PROJECT_INITIALIZATION_WORKFLOW),
    executionId: Type.String({ minLength: 1 }),
    taskQueue: Type.Literal(PROJECT_INITIALIZATION_TASK_QUEUE),
    projectId: UUID,
    projectTypeId: UUID,
    projectVersion: Type.Integer({ minimum: 1 }),
    idReusePolicy: Type.Literal("ALLOW_DUPLICATE_FAILED_ONLY"),
    idConflictPolicy: Type.Literal("FAIL"),
  }),
  ProjectInitializationTemporalResult: Type.Object({
    disposition: Type.Union([Type.Literal("started"), Type.Literal("already_started")]),
    workflowStatus: Type.Union([
      Type.Literal("PENDING"),
      Type.Literal("RUNNING"),
      Type.Literal("COMPLETED"),
      Type.Literal("FAILED"),
      Type.Literal("CANCELED"),
      Type.Literal("TERMINATED"),
      Type.Literal("CONTINUED_AS_NEW"),
      Type.Literal("TIMED_OUT"),
    ]),
  }),
  ProjectInitializationTemporalError: Type.Object({
    code: Type.Literal("TEMPORAL_OPERATION_FAILED"),
    message: Type.String({ minLength: 1 }),
  }),
});

export const PROJECT_INITIALIZATION_TEMPORAL_OPERATION =
  "project-initialization.start-or-attach-and-describe" as const;
export const ProjectInitializationTemporalInput = contracts.Import(
  "ProjectInitializationTemporalInput",
);
export const ProjectInitializationTemporalResult = contracts.Import(
  "ProjectInitializationTemporalResult",
);
export const ProjectInitializationTemporalError = contracts.Import(
  "ProjectInitializationTemporalError",
);

export type ProjectInitializationTemporalInput = Static<typeof ProjectInitializationTemporalInput>;
export type ProjectInitializationTemporalResult = Static<
  typeof ProjectInitializationTemporalResult
>;
export type ProjectInitializationTemporalError = Static<typeof ProjectInitializationTemporalError>;
