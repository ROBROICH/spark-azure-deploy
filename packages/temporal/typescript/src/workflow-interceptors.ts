import { defaultPayloadConverter, type Headers, type Payload } from "@temporalio/common";
import {
  ApplicationFailure,
  AsyncLocalStorage,
  ContinueAsNew,
  isCancellation,
  proxySinks,
  workflowInfo,
  type Sinks,
  type WorkflowInterceptors,
} from "@temporalio/workflow";

import {
  Value,
  WorkflowFailureCodeSchema,
  WorkflowFailureDetailsSchema,
  type TemporalWorkflowContext,
  type WorkflowStatusEvent,
} from "@spark-temporal/contracts";

import { TEMPORAL_CONTEXT_HEADER } from "./context-header.js";

interface SparkTemporalSinks extends Sinks {
  sparkTemporalTracking: {
    report(event: WorkflowStatusEvent): void;
  };
}

const { sparkTemporalTracking } = proxySinks<SparkTemporalSinks>();
const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function headersWithContext(headers: Headers, context: Payload | undefined): Headers {
  return context === undefined
    ? { ...headers }
    : { ...headers, [TEMPORAL_CONTEXT_HEADER]: context };
}

type FailureFields = Pick<WorkflowStatusEvent, "failureCode" | "failureBranches">;

/** Reads the catalog code and failed branches a workflow put on its terminal `ApplicationFailure`. */
export function failureFields(error: Error): FailureFields {
  if (!(error instanceof ApplicationFailure)) return {};
  if (!Value.Check(WorkflowFailureCodeSchema, error.type)) return {};
  const details = error.details?.[0];
  return {
    failureCode: error.type,
    failureBranches: Value.Check(WorkflowFailureDetailsSchema, details) ? details.branches : null,
  };
}

function statusEvent(
  status: WorkflowStatusEvent["status"],
  context: Payload | undefined,
  failureMessage?: string,
  failure: FailureFields = {},
): WorkflowStatusEvent {
  const info = workflowInfo();
  const event: WorkflowStatusEvent = {
    workflowId: info.workflowId,
    runId: info.runId,
    workflowType: info.workflowType,
    status,
    timestamp: new Date().toISOString(),
  };
  if (failureMessage !== undefined) {
    event.failureMessage = failureMessage.slice(0, 500);
  }
  Object.assign(event, failure);
  if (context !== undefined) {
    const decoded = defaultPayloadConverter.fromPayload<TemporalWorkflowContext>(context);
    if (decoded.project && canonicalUuid.test(decoded.project.projectId)) {
      event.projectId = decoded.project.projectId;
      event.projectVersion = decoded.project.projectVersion;
    }
  }
  return event;
}

export function interceptors(): WorkflowInterceptors {
  const contextStorage = new AsyncLocalStorage<Payload | undefined>();
  let initialContext: Payload | undefined;
  const currentContext = () => contextStorage.getStore() ?? initialContext;

  return {
    inbound: [
      {
        async execute(input, next) {
          initialContext = input.headers[TEMPORAL_CONTEXT_HEADER];
          return contextStorage.run(initialContext, async () => {
            if (workflowInfo().parent !== undefined) return next(input);
            sparkTemporalTracking.report(statusEvent("running", currentContext()));
            try {
              const result = await next(input);
              sparkTemporalTracking.report(statusEvent("completed", currentContext()));
              return result;
            } catch (error) {
              if (error instanceof ContinueAsNew) {
                sparkTemporalTracking.report(statusEvent("completed", currentContext()));
              } else {
                sparkTemporalTracking.report(
                  statusEvent(
                    isCancellation(error) ? "cancelled" : "failed",
                    currentContext(),
                    error instanceof Error ? error.message : "Workflow failed",
                    error instanceof Error ? failureFields(error) : {},
                  ),
                );
              }
              throw error;
            }
          });
        },
        handleSignal(input, next) {
          const context = input.headers[TEMPORAL_CONTEXT_HEADER] ?? initialContext;
          return contextStorage.run(context, () => next(input));
        },
        handleUpdate(input, next) {
          const context = input.headers[TEMPORAL_CONTEXT_HEADER] ?? initialContext;
          return contextStorage.run(context, () => next(input));
        },
      },
    ],
    outbound: [
      {
        scheduleActivity(input, next) {
          return next({
            ...input,
            headers: headersWithContext(input.headers, currentContext()),
          });
        },
        scheduleLocalActivity(input, next) {
          return next({
            ...input,
            headers: headersWithContext(input.headers, currentContext()),
          });
        },
        startChildWorkflowExecution(input, next) {
          return next({
            ...input,
            headers: headersWithContext(input.headers, currentContext()),
          });
        },
        signalWorkflow(input, next) {
          return next({
            ...input,
            headers: headersWithContext(input.headers, currentContext()),
          });
        },
        continueAsNew(input, next) {
          return next({
            ...input,
            headers: headersWithContext(input.headers, currentContext()),
          });
        },
      },
    ],
  };
}
