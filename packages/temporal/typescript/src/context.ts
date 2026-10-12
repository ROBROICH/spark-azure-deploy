import { AsyncLocalStorage } from "node:async_hooks";

import { currentAuditContext, withAuditContext, type AuditContext } from "@spark-workflow/audit-client";
import type { ClientInterceptors, WorkflowClientInterceptor } from "@temporalio/client";
import { defaultPayloadConverter, type Headers } from "@temporalio/common";
import type { ActivityInterceptorsFactory, WorkerInterceptors } from "@temporalio/worker";

import type { Static } from "@spark-temporal/contracts";
import { TemporalWorkflowContext } from "@spark-temporal/contracts";
import { TEMPORAL_CONTEXT_HEADER } from "./context-header";

export interface ProjectContext {
  readonly projectId: string;
  readonly projectVersion: number;
}

export interface WorkflowRuntimeContext {
  readonly project?: ProjectContext;
  readonly audit: AuditContext;
}

class TemporalContextValidationError extends Error {}

export const projectContexts = new AsyncLocalStorage<ProjectContext | undefined>();

function validateProject(project: ProjectContext): ProjectContext {
  const projectId = project.projectId.trim();
  if (projectId.length === 0) {
    throw new TemporalContextValidationError("project context projectId must not be empty");
  }
  if (!Number.isInteger(project.projectVersion) || project.projectVersion < 1) {
    throw new TemporalContextValidationError(
      "project context projectVersion must be a positive integer",
    );
  }
  return { projectId, projectVersion: project.projectVersion };
}

function contextToWire(context: WorkflowRuntimeContext): Static<typeof TemporalWorkflowContext> {
  return {
    audit: {
      actorUserId: context.audit.actorUserId ?? null,
      triggeredByUserId: context.audit.triggeredByUserId ?? null,
      workflowRunId: context.audit.workflowRunId ?? null,
      workflowType: context.audit.workflowType ?? null,
      requestStartTime: context.audit.requestStartTime ?? null,
      requestId: context.audit.requestId ?? null,
    },
    project:
      context.project === undefined
        ? null
        : {
            projectId: context.project.projectId,
            projectVersion: context.project.projectVersion,
          },
  };
}

type CamelContext = Static<typeof TemporalWorkflowContext>;

function contextFromWire(value: CamelContext): WorkflowRuntimeContext {
  const audit: AuditContext = {
    actorUserId: value.audit.actorUserId ?? undefined,
    triggeredByUserId: value.audit.triggeredByUserId ?? undefined,
    workflowRunId: value.audit.workflowRunId ?? undefined,
    workflowType: value.audit.workflowType ?? undefined,
    requestStartTime: value.audit.requestStartTime ?? undefined,
    requestId: value.audit.requestId ?? undefined,
  };
  if (value.project === null) return { audit };
  return {
    audit,
    project: {
      projectId: value.project.projectId,
      projectVersion: value.project.projectVersion,
    },
  };
}

export function runWithProjectContext<Result>(
  project: ProjectContext | undefined,
  operation: () => Result,
): Result {
  return projectContexts.run(
    project === undefined ? undefined : validateProject(project),
    operation,
  );
}

export function captureWorkflowContext(): WorkflowRuntimeContext {
  const project = projectContexts.getStore();
  const audit = currentAuditContext();
  return project === undefined ? { audit } : { audit, project };
}

export function temporalContextHeaders(headers: Headers): Headers {
  const payload = defaultPayloadConverter.toPayload(contextToWire(captureWorkflowContext()));
  return payload === undefined
    ? { ...headers }
    : { ...headers, [TEMPORAL_CONTEXT_HEADER]: payload };
}

const workflowContextInterceptor: WorkflowClientInterceptor = {
  startWithDetails: (input, next) =>
    next({ ...input, headers: temporalContextHeaders(input.headers) }),
  startUpdate: (input, next) => next({ ...input, headers: temporalContextHeaders(input.headers) }),
  startUpdateWithStart: (input, next) =>
    next({
      ...input,
      workflowStartHeaders: temporalContextHeaders(input.workflowStartHeaders),
      updateHeaders: temporalContextHeaders(input.updateHeaders),
    }),
  signal: (input, next) => next({ ...input, headers: temporalContextHeaders(input.headers) }),
  signalWithStart: (input, next) =>
    next({ ...input, headers: temporalContextHeaders(input.headers) }),
};

export const temporalClientInterceptors: ClientInterceptors = {
  workflow: [workflowContextInterceptor],
};

function activityContextInterceptor(): ActivityInterceptorsFactory {
  return (activity) => ({
    inbound: {
      async execute(input, next) {
        const payload = input.headers[TEMPORAL_CONTEXT_HEADER];
        const context =
          payload === undefined
            ? ({ audit: {} } satisfies WorkflowRuntimeContext)
            : contextFromWire(defaultPayloadConverter.fromPayload<CamelContext>(payload));
        const audit = { ...context.audit };
        if (activity.info.workflowExecution !== undefined) {
          audit.workflowRunId = activity.info.workflowExecution.runId;
        }
        if (activity.info.workflowType !== undefined) {
          audit.workflowType = activity.info.workflowType;
        }
        return projectContexts.run(context.project, () => withAuditContext(audit, () => next(input)));
      },
    },
  });
}

export function createTemporalWorkerInterceptors(): WorkerInterceptors {
  return {
    client: temporalClientInterceptors,
    activity: [activityContextInterceptor()],
  };
}
