import { Client, Connection, type WorkflowClient, type WorkflowExecutionDescription } from "@temporalio/client";
import { executionInfoFromRaw } from "@temporalio/client/lib/helpers";
import { Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { isoInstant } from "@spark-workflow/http-host";
import { readTemporalFixture } from "@spark-temporal/typescript/caller";
import { createS3PayloadCodec } from "@spark-temporal/typescript/s3-payload-codec";

import type { TemporalQueryConfiguration } from "../env.ts";
import { temporalJobErrors } from "../errors.ts";
import { statusFailure } from "../workflow-failure.ts";
import {
  ExecutionTreeInputSchema,
  ExecutionTreeResponseSchema,
  NullableUuidSchema,
  SystemLoadInputSchema,
  SystemLoadResponseSchema,
  TemporalReadErrorSchema,
  WorkflowReadInputSchema,
  WorkflowResponseSchema,
  WorkflowSummarySchema,
  WorkflowsByTypeInputSchema,
  WorkflowsByTypeResponseSchema,
  WorkflowsListInputSchema,
  WorkflowsResponseSchema,
  type ExecutionTreeInput,
  type ExecutionTreeResponse,
  type ExecutionTreeNode,
  type SystemLoadInput,
  type SystemLoadResponse,
  type TemporalStatus,
  type WorkflowReadInput,
  type WorkflowResponse,
  type WorkflowsByTypeInput,
  type WorkflowsListInput,
} from "../schemas.ts";

function temporalStatus(status: string): TemporalStatus | null {
  switch (status) {
    case "RUNNING": return "running";
    case "COMPLETED": return "completed";
    case "FAILED": return "failed";
    case "CANCELED":
    case "CANCELLED": return "canceled";
    case "TERMINATED": return "terminated";
    case "TIMED_OUT": return "timed_out";
    case "CONTINUED_AS_NEW": return "continued_as_new";
    case "PENDING": return "pending";
    default: return null;
  }
}

async function workflowPage(client: WorkflowClient, input: WorkflowsListInput | WorkflowsByTypeInput) {
  const rootWorkflowId = "rootWorkflowId" in input ? input.rootWorkflowId : undefined;
  const rootRunId = "rootRunId" in input ? input.rootRunId : undefined;
  const workflowIds = "workflowIds" in input ? input.workflowIds : undefined;
  let root: WorkflowExecutionDescription | undefined;
  const query: string[] = [];
  if (rootWorkflowId !== undefined || rootRunId !== undefined) {
    if (rootWorkflowId === undefined || rootRunId === undefined) throw temporalJobErrors.INVALID_CONTINUATION();
    root = await client.getHandle(rootWorkflowId, rootRunId).describe();
    if (root.searchAttributes.ProjectId?.[0] !== input.projectId ||
      (input.projectVersion !== null && root.searchAttributes.ProjectVersion?.[0] !== input.projectVersion) ||
      root.parentExecution !== undefined) {
      throw temporalJobErrors.INVALID_CONTINUATION();
    }
    query.push(
      "`ParentWorkflowId` IS NOT null",
      `\`RootWorkflowId\` = ${JSON.stringify(root.workflowId)}`,
      `\`RootRunId\` = ${JSON.stringify(root.runId)}`,
      `(\`ProjectId\` IS null OR \`ProjectId\` = "${input.projectId}")`,
    );
    if (input.projectVersion !== null) {
      query.push(`(\`ProjectVersion\` IS null OR \`ProjectVersion\` = ${input.projectVersion})`);
    }
  } else {
    query.push("`ParentWorkflowId` IS null", `\`ProjectId\` = "${input.projectId}"`);
    if (input.projectVersion !== null) query.push(`\`ProjectVersion\` = ${input.projectVersion}`);
  }
  if ("workflowType" in input) query.push(`\`WorkflowType\` = "${input.workflowType}"`);
  if (input.workflowId !== undefined) query.push(`\`WorkflowId\` = ${JSON.stringify(input.workflowId)}`);
  if (workflowIds !== undefined) {
    query.push(`\`WorkflowId\` IN (${workflowIds.map((workflowId) => JSON.stringify(workflowId)).join(", ")})`);
  }
  if (input.executionStatus !== "all") {
    query.push(`\`ExecutionStatus\` = "${input.executionStatus}"`);
  }
  const page = await client.workflowService.listWorkflowExecutions({
    namespace: client.options.namespace,
    query: query.join(" AND "),
    pageSize: input.pageSize,
    nextPageToken: input.nextPageToken === null ? undefined : Buffer.from(input.nextPageToken, "base64"),
  });
  const workflows = [];
  for (const raw of page.executions) {
    const workflow = await executionInfoFromRaw(raw, client.options.loadedDataConverter, raw, client.options.namespace);
    const projectId = workflow.searchAttributes.ProjectId?.[0] ?? root?.searchAttributes.ProjectId?.[0];
    const projectVersion = workflow.searchAttributes.ProjectVersion?.[0] ?? root?.searchAttributes.ProjectVersion?.[0];
    const status = temporalStatus(workflow.status.name);
    if (
      projectId !== input.projectId ||
      (root === undefined ? workflow.parentExecution !== undefined :
        workflow.parentExecution === undefined ||
        workflow.rootExecution?.workflowId !== root.workflowId || workflow.rootExecution.runId !== root.runId) ||
      (input.projectVersion !== null && projectVersion !== input.projectVersion) ||
      ("workflowType" in input && workflow.type !== input.workflowType) ||
      (input.workflowId !== undefined && workflow.workflowId !== input.workflowId) ||
      (workflowIds !== undefined && !workflowIds.includes(workflow.workflowId)) ||
      (input.executionStatus !== "all" &&
        status?.replaceAll("_", "") !== input.executionStatus.toLowerCase())
    ) {
      throw temporalJobErrors.INVALID_CONTINUATION();
    }
    workflows.push({
      workflowId: workflow.workflowId,
      runId: workflow.runId,
      projectId: input.projectId,
      projectVersion: Value.Parse(WorkflowSummarySchema.properties.projectVersion, projectVersion ?? null),
      workflowType: workflow.type,
      status,
      workflowStartTime: isoInstant(workflow.startTime),
      workflowCloseTime: workflow.closeTime ? isoInstant(workflow.closeTime) : null,
      failure: statusFailure(status),
    });
  }
  return {
    retrievedWorkflows: workflows.length,
    workflows,
    nextPageToken: page.nextPageToken.length === 0 ? null : Buffer.from(page.nextPageToken).toString("base64"),
  };
}

export async function listWorkflows(source: TemporalWorkflowsService, input: WorkflowsListInput) {
  const fixture = readTemporalFixture("temporal-job.workflows.list", input, {
    input: WorkflowsListInputSchema,
    result: WorkflowsResponseSchema,
    error: TemporalReadErrorSchema,
  });
  if (fixture !== undefined) return fixture;
  return workflowPage(await source.get(), input);
}

export async function listWorkflowsByType(source: TemporalWorkflowsService, input: WorkflowsByTypeInput) {
  // The query parser splits each workflowIds value on commas after its own size check, so check the decoded list again.
  if (input.workflowIds !== undefined &&
    (!Value.Check(WorkflowsByTypeInputSchema.properties.workflowIds, input.workflowIds) ||
      input.workflowId !== undefined || input.rootWorkflowId !== undefined || input.rootRunId !== undefined)) {
    throw temporalJobErrors.INVALID_WORKFLOW_FILTER();
  }
  const fixture = readTemporalFixture("temporal-job.workflows.by-type", input, {
    input: WorkflowsByTypeInputSchema,
    result: WorkflowsByTypeResponseSchema,
    error: TemporalReadErrorSchema,
  });
  if (fixture !== undefined) return fixture;
  return {
    projectId: input.projectId,
    workflowType: input.workflowType,
    ...await workflowPage(await source.get(), input),
  };
}

export async function getWorkflowProject(source: TemporalWorkflowsService, input: WorkflowReadInput) {
  const fixture = readTemporalFixture("temporal-job.workflow.project", input, {
    input: WorkflowReadInputSchema,
    result: T.Object({ projectId: NullableUuidSchema, runId: T.String({ minLength: 1 }) }, { additionalProperties: false }),
    error: TemporalReadErrorSchema,
  });
  if (fixture !== undefined) return fixture;
  const client = await source.get();
  const description = await client.getHandle(input.workflowId, input.runId).describe();
  let projectId = description.searchAttributes.ProjectId?.[0];
  const rootExecution = description.rootExecution;
  if (projectId === undefined && rootExecution?.workflowId && rootExecution.runId &&
    rootExecution.runId !== description.runId) {
    const root = await client.getHandle(rootExecution.workflowId, rootExecution.runId).describe();
    projectId = root.searchAttributes.ProjectId?.[0];
  }
  return { projectId: Value.Parse(NullableUuidSchema, projectId ?? null), runId: description.runId };
}

export async function getWorkflow(source: TemporalWorkflowsService, input: WorkflowReadInput) {
  const fixture = readTemporalFixture("temporal-job.workflow.get", input, {
    input: WorkflowReadInputSchema,
    result: WorkflowResponseSchema,
    error: TemporalReadErrorSchema,
  });
  if (fixture !== undefined) return fixture;
  const client = await source.get();
  const description = await client.getHandle(input.workflowId, input.runId).describe();
  const result = description.closeTime && input.includeResult !== false
    ? await client.getHandle(input.workflowId, description.runId, { followRuns: false }).result()
    : null;
  return {
    workflowId: description.workflowId,
    runId: description.runId,
    workflowType: description.type,
    workflowStartTime: isoInstant(description.startTime),
    workflowCloseTime: description.closeTime ? isoInstant(description.closeTime) : null,
    status: temporalStatus(description.status.name),
    result: (result ?? null) as WorkflowResponse["result"],
  };
}

export async function getExecutionTree(
  source: TemporalWorkflowsService,
  input: ExecutionTreeInput,
): Promise<ExecutionTreeResponse> {
  if (input.nextPageToken !== null && input.runId === undefined) {
    throw temporalJobErrors.INVALID_CONTINUATION();
  }
  const fixture = readTemporalFixture("temporal-job.workflow.execution-tree", input, {
    input: ExecutionTreeInputSchema,
    result: ExecutionTreeResponseSchema,
    error: TemporalReadErrorSchema,
  });
  if (fixture !== undefined) return fixture;
  const client = await source.get();
  const description = await client.getHandle(input.workflowId, input.runId).describe();
  const page = await client.workflowService.getWorkflowExecutionHistory({
    namespace: client.options.namespace,
    execution: { workflowId: description.workflowId, runId: description.runId },
    maximumPageSize: input.pageSize,
    nextPageToken: input.nextPageToken === null ? undefined : Buffer.from(input.nextPageToken, "base64"),
    waitNewEvent: false,
  });
  if (page.rawHistory.length > 0) throw temporalJobErrors.EXECUTION_TREE_FAILED();
  const children = new Map<number, ExecutionTreeNode>();
  let error: string | null = null;
  let continuedAsNewRunId: string | null = null;
  for (const event of page.history?.events ?? []) {
    const scheduled = event.activityTaskScheduledEventAttributes;
    if (scheduled) {
      const eventId = Number(event.eventId);
      children.set(eventId, {
        type: "activity", eventId, id: scheduled.activityId ?? null,
        name: scheduled.activityType?.name ?? null, runId: null,
        status: "pending", error: null, children: [],
      });
    }
    const activityStarted = event.activityTaskStartedEventAttributes;
    const activityCompleted = event.activityTaskCompletedEventAttributes;
    const activityFailed = event.activityTaskFailedEventAttributes;
    const activityCanceled = event.activityTaskCanceledEventAttributes;
    const activityTimedOut = event.activityTaskTimedOutEventAttributes;
    const activity = activityStarted ?? activityCompleted ?? activityFailed ?? activityCanceled ?? activityTimedOut;
    if (activity) {
      const eventId = Number(activity.scheduledEventId);
      const node: ExecutionTreeNode = children.get(eventId) ?? {
        type: "activity", eventId, id: null, name: null, runId: null,
        status: "pending", error: null, children: [],
      };
      node.status = activityStarted ? "running" : activityCompleted ? "completed" :
        activityCanceled ? "canceled" : activityTimedOut ? "timed_out" : "failed";
      node.error = activityFailed?.failure?.message ??
        (activityCanceled?.details ? JSON.stringify(activityCanceled.details) : null);
      children.set(eventId, node);
    }
    const initiated = event.startChildWorkflowExecutionInitiatedEventAttributes;
    if (initiated) {
      const eventId = Number(event.eventId);
      children.set(eventId, {
        type: "workflow", eventId, id: initiated.workflowId ?? null,
        name: initiated.workflowType?.name ?? null, runId: null,
        status: "pending", error: null, children: null,
      });
    }
    const childStarted = event.childWorkflowExecutionStartedEventAttributes;
    const childCompleted = event.childWorkflowExecutionCompletedEventAttributes;
    const childFailed = event.childWorkflowExecutionFailedEventAttributes;
    const childCanceled = event.childWorkflowExecutionCanceledEventAttributes;
    const childTimedOut = event.childWorkflowExecutionTimedOutEventAttributes;
    const childTerminated = event.childWorkflowExecutionTerminatedEventAttributes;
    const child = childStarted ?? childCompleted ?? childFailed ?? childCanceled ?? childTimedOut ?? childTerminated;
    if (child) {
      const eventId = Number(child.initiatedEventId);
      const node: ExecutionTreeNode = children.get(eventId) ?? {
        type: "workflow", eventId, id: null, name: null, runId: null,
        status: "pending", error: null, children: null,
      };
      node.id = child.workflowExecution?.workflowId ?? node.id;
      node.name = child.workflowType?.name ?? node.name;
      node.runId = child.workflowExecution?.runId ?? node.runId;
      node.status = childStarted ? "running" : childCompleted ? "completed" :
        childCanceled ? "canceled" : childTimedOut ? "timed_out" : childTerminated ? "terminated" : "failed";
      node.error = childFailed?.failure?.message ??
        (childCanceled?.details ? JSON.stringify(childCanceled.details) : null);
      children.set(eventId, node);
    }
    const startFailed = event.startChildWorkflowExecutionFailedEventAttributes;
    if (startFailed) {
      const eventId = Number(startFailed.initiatedEventId);
      const node: ExecutionTreeNode = children.get(eventId) ?? {
        type: "workflow", eventId, id: startFailed.workflowId ?? null,
        name: startFailed.workflowType?.name ?? null, runId: null,
        status: "failed", error: null, children: null,
      };
      node.status = "failed";
      children.set(eventId, node);
    }
    error = event.workflowExecutionFailedEventAttributes?.failure?.message ??
      event.workflowExecutionTerminatedEventAttributes?.reason ?? error;
    if (event.workflowExecutionCanceledEventAttributes?.details) {
      error = JSON.stringify(event.workflowExecutionCanceledEventAttributes.details);
    }
    continuedAsNewRunId = event.workflowExecutionContinuedAsNewEventAttributes?.newExecutionRunId ?? continuedAsNewRunId;
  }
  const nextPageToken = page.nextPageToken.length === 0 ? null : Buffer.from(page.nextPageToken).toString("base64");
  return {
    type: "workflow",
    name: description.type,
    id: description.workflowId,
    runId: description.runId,
    status: temporalStatus(description.status.name),
    error,
    children: [...children.values()].sort((left, right) => left.eventId - right.eventId),
    nextPageToken,
    historyComplete: nextPageToken === null,
    continuedAsNewRunId,
  };
}

export async function getSystemLoad(source: TemporalWorkflowsService, input: SystemLoadInput) {
  const fixture = readTemporalFixture("temporal-job.load.get", input, {
    input: SystemLoadInputSchema,
    result: SystemLoadResponseSchema,
    error: TemporalReadErrorSchema,
  });
  if (fixture !== undefined) return fixture;
  const client = await source.get();
  const query = '`ExecutionStatus` = "Running" AND `ProjectId` IS NOT null';
  const workflowTypes = Object.keys(input.workflowComplexity).sort();
  const typeLiterals = workflowTypes.map((workflowType) => JSON.stringify(workflowType));
  const breakdown: SystemLoadResponse["breakdown"] = [];
  for (const [index, workflowType] of workflowTypes.entries()) {
    const { count } = await client.count(`${query} AND \`WorkflowType\` = ${typeLiterals[index]}`);
    if (count === 0) continue;
    const weight = input.workflowComplexity[workflowType]!;
    breakdown.push({ workflowType, runningCount: count, complexityWeight: weight, totalComplexity: count * weight });
  }
  const { count } = await client.count(typeLiterals.length === 0 ? query :
    `${query} AND \`WorkflowType\` NOT IN (${typeLiterals.join(", ")})`);
  if (count > 0) {
    breakdown.push({
      workflowType: null,
      runningCount: count,
      complexityWeight: input.defaultWorkflowComplexityWeight,
      totalComplexity: count * input.defaultWorkflowComplexityWeight,
    });
  }
  const currentComplexity = breakdown.reduce((total, entry) => total + entry.totalComplexity, 0);
  const runningWorkflows = breakdown.reduce((total, entry) => total + entry.runningCount, 0);
  return {
    loadPercentage: Math.round((currentComplexity / input.maxComplexity) * 10_000) / 100,
    runningWorkflows,
    currentComplexity,
    maxComplexity: input.maxComplexity,
    breakdown,
  };
}

export type TemporalWorkflowsService = ReturnType<typeof connectTemporalWorkflows>;

export function connectTemporalWorkflows(
  configuration: Pick<
    TemporalQueryConfiguration,
    "temporalHost" | "temporalNamespace" | "payloadStorage"
  >,
) {
  let connection: Connection | undefined;
  let payloadCodec: ReturnType<typeof createS3PayloadCodec> | undefined;
  let acquisition: Promise<WorkflowClient> | undefined;
  let closed = false;
  const acquireWorkflowClient = async (): Promise<WorkflowClient> => {
    const connected = await Connection.connect({ address: configuration.temporalHost });
    let codec: ReturnType<typeof createS3PayloadCodec> | undefined;
    try {
      if (closed) {
        throw temporalJobErrors.WORKFLOW_READ_FAILED({ message: "Temporal query service is closed" });
      }
      codec =
        configuration.payloadStorage === null
          ? undefined
          : createS3PayloadCodec(configuration.payloadStorage);
      const workflow = new Client({
        connection: connected,
        namespace: configuration.temporalNamespace,
        dataConverter: codec === undefined ? undefined : { payloadCodecs: [codec] },
      }).workflow;
      connection = connected;
      payloadCodec = codec;
      return workflow;
    } catch (cause) {
      await Promise.allSettled([connected.close(), codec?.close()]);
      throw cause;
    }
  };
  return Object.freeze({
    async get(): Promise<WorkflowClient> {
      if (closed) throw temporalJobErrors.WORKFLOW_READ_FAILED({ message: "Temporal query service is closed" });
      const current = (acquisition ??= acquireWorkflowClient());
      try {
        return await current;
      } catch (error) {
        if (acquisition === current) acquisition = undefined;
        throw error;
      }
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      const active = connection;
      const codec = payloadCodec;
      connection = undefined;
      payloadCodec = undefined;
      const pending = acquisition;
      acquisition = undefined;
      if (active !== undefined) {
        await Promise.all([active.close(), codec?.close()]);
        return;
      }
      await pending?.then(() => undefined, () => undefined);
    },
  });
}
