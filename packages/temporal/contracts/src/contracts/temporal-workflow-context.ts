import { Type, type Static } from "@sinclair/typebox";

import { DateTime, UUID } from "../registry.js";

const contracts = Type.Module({
  TemporalAuditContext: Type.Object({
    actorUserId: Type.Union([UUID, Type.Null()]),
    triggeredByUserId: Type.Union([UUID, Type.Null()]),
    workflowRunId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    workflowType: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    requestStartTime: Type.Union([DateTime, Type.Null()]),
    requestId: Type.Union([UUID, Type.Null()]),
  }),
  TemporalProjectContext: Type.Object({
    projectId: Type.String({ minLength: 1 }),
    projectVersion: Type.Integer({ minimum: 1 }),
  }),
  TemporalWorkflowContext: Type.Object({
    audit: Type.Ref("TemporalAuditContext"),
    project: Type.Union([Type.Ref("TemporalProjectContext"), Type.Null()]),
  }),
});

export const TemporalAuditContext = contracts.Import("TemporalAuditContext");
export const TemporalProjectContext = contracts.Import("TemporalProjectContext");
export const TemporalWorkflowContext = contracts.Import("TemporalWorkflowContext");

export type TemporalAuditContext = Static<typeof TemporalAuditContext>;
export type TemporalProjectContext = Static<typeof TemporalProjectContext>;
export type TemporalWorkflowContext = Static<typeof TemporalWorkflowContext>;
