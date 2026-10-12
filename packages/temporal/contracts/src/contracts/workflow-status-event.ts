import { Type, type Static } from "@sinclair/typebox";

import { DateTime, UUID } from "../registry.js";
import {
  type WorkflowFailureCode,
  WorkflowFailureBranchSchema,
  WorkflowFailureCodeSchema,
} from "../workflow-failure.js";

const contracts = Type.Module({
  // Unsafe keeps the catalog's JSON schema while giving the module a concrete static type.
  WorkflowFailureCode: Type.Unsafe<WorkflowFailureCode>(WorkflowFailureCodeSchema),
  // The Ref lets Python generation reuse the WorkflowFailureCode enum instead of inlining it.
  WorkflowFailureBranch: Type.Object(
    { ...WorkflowFailureBranchSchema.properties, errorCode: Type.Ref("WorkflowFailureCode") },
    { additionalProperties: false },
  ),
  WorkflowStatus: Type.Union([
    Type.Literal("pending"),
    Type.Literal("running"),
    Type.Literal("failed"),
    Type.Literal("completed"),
    Type.Literal("terminated"),
    Type.Literal("cancelled"),
    Type.Literal("timed_out"),
  ]),
  WorkflowStatusEvent: Type.Object({
    workflowId: Type.String(),
    runId: Type.String(),
    workflowType: Type.String(),
    status: Type.Ref("WorkflowStatus"),
    timestamp: DateTime,
    projectId: Type.Optional(Type.Union([UUID, Type.Null()], { default: null })),
    projectVersion: Type.Optional(
      Type.Union([Type.Integer(), Type.Null()], { default: null }),
    ),
    historyS3Key: Type.Optional(
      Type.Union([Type.String(), Type.Null()], { default: null }),
    ),
    failureMessage: Type.Optional(
      Type.Union([Type.String({ maxLength: 500 }), Type.Null()], { default: null }),
    ),
    failureCode: Type.Optional(
      Type.Union([Type.Ref("WorkflowFailureCode"), Type.Null()], { default: null }),
    ),
    failureBranches: Type.Optional(
      Type.Union([Type.Array(Type.Ref("WorkflowFailureBranch")), Type.Null()], { default: null }),
    ),
  }),
});

export const WorkflowStatus = contracts.Import("WorkflowStatus");
export const WorkflowStatusEvent = contracts.Import("WorkflowStatusEvent");
export type WorkflowStatus = Static<typeof WorkflowStatus>;
export type WorkflowStatusEvent = Static<typeof WorkflowStatusEvent>;
