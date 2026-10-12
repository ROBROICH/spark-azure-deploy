export const auditContext = {
  actorUserId: "00000000-0000-4000-8000-000000000301",
  triggeredByUserId: "00000000-0000-4000-8000-000000000302",
  requestId: "00000000-0000-4000-8000-000000000303",
  requestStartTime: "2026-07-16T10:11:12.123Z",
  workflowRunId: "fixture-test-run-7",
  workflowType: "AgentOrchestrationPeerClients",
} as const;

export const auditHeaders = {
  "X-Actor-User-Id": auditContext.actorUserId,
  "X-Triggered-By-User-Id": auditContext.triggeredByUserId,
  "X-Request-Id": auditContext.requestId,
  "X-Request-Starttime": auditContext.requestStartTime,
  "X-Workflow-Run-Id": auditContext.workflowRunId,
  "X-Workflow-Type": auditContext.workflowType,
} as const;
