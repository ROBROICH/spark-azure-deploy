import { Type, type Static } from "@sinclair/typebox";

import { UUID, type WorkflowName } from "../registry.js";

export const PROJECT_DELETION_TASK_QUEUE = "project_logic_service" as const;
export const PROJECT_DELETION_WORKFLOW =
  "DeleteProjectWorkflow" as WorkflowName<"DeleteProjectWorkflow">;

const contracts = Type.Module({
  ProjectDeletionWorkflowActorContext: Type.Object({
    actorUserId: Type.Union([UUID, Type.Null()]),
    triggeredByUserId: Type.Union([UUID, Type.Null()]),
    workflowType: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  }),
  ProjectDeletionTemporalInput: Type.Object({
    workflowName: Type.Literal(PROJECT_DELETION_WORKFLOW),
    executionId: Type.String({ minLength: 1 }),
    taskQueue: Type.Literal(PROJECT_DELETION_TASK_QUEUE),
    projectId: UUID,
    projectVersion: Type.Integer({ minimum: 1 }),
    idReusePolicy: Type.Literal("ALLOW_DUPLICATE_FAILED_ONLY"),
    idConflictPolicy: Type.Literal("USE_EXISTING"),
    workflowActor: Type.Union([Type.Ref("ProjectDeletionWorkflowActorContext"), Type.Null()]),
  }),
  ProjectDeletionTemporalResult: Type.Object({ started: Type.Literal(true) }),
  ProjectDeletionTemporalError: Type.Object({
    code: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
  }),
});

export const PROJECT_DELETION_TEMPORAL_OPERATION = "project-deletion.start" as const;
export const ProjectDeletionWorkflowActorContext = contracts.Import(
  "ProjectDeletionWorkflowActorContext",
);
export const ProjectDeletionTemporalInput = contracts.Import("ProjectDeletionTemporalInput");
export const ProjectDeletionTemporalResult = contracts.Import("ProjectDeletionTemporalResult");
export const ProjectDeletionTemporalError = contracts.Import("ProjectDeletionTemporalError");

export type ProjectDeletionWorkflowActorContext = Static<
  typeof ProjectDeletionWorkflowActorContext
>;
export type ProjectDeletionTemporalInput = Static<typeof ProjectDeletionTemporalInput>;
export type ProjectDeletionTemporalResult = Static<typeof ProjectDeletionTemporalResult>;
export type ProjectDeletionTemporalError = Static<typeof ProjectDeletionTemporalError>;
