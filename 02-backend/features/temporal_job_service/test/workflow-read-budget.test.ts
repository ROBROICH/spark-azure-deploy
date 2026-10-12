import { Client, Connection, type WorkflowHandle, type WorkflowHandleWithStartDetails } from "@temporalio/client";
import { google, temporal } from "@temporalio/proto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  connectTemporalWorkflows,
  getExecutionTree,
  getSystemLoad,
  getWorkflow,
  getWorkflowProject,
  listWorkflows,
  listWorkflowsByType,
  type TemporalWorkflowsService,
} from "../src/temporal/queries.ts";
import type { WorkflowsResponse } from "../src/schemas.ts";

const address = process.env.TEMPORAL_JOB_TEST_ADDRESS;
const namespace = process.env.TEMPORAL_JOB_TEST_NAMESPACE;
const workflowTaskTimeout = google.protobuf.Duration.fromObject({ seconds: 10 });

describe.skipIf(address === undefined || namespace === undefined)("native Temporal continuation", () => {
  const projectId = randomUUID();
  const workflowType = `Paging_${randomUUID().replaceAll("-", "")}`;
  const handles: WorkflowHandle[] = [];
  let connection: Connection;
  let client: Client;
  let workflows: TemporalWorkflowsService;
  let parent: WorkflowHandleWithStartDetails;
  const children = Array.from({ length: 105 }, () => randomUUID());
  const grandchildId = randomUUID();

  beforeAll(async () => {
    expect(process.env.SPARK_TEMPORAL_FIXTURE_FILE).toBeUndefined();
    connection = await Connection.connect({ address });
    client = new Client({ connection, namespace });
    workflows = connectTemporalWorkflows({
      temporalHost: address!,
      temporalNamespace: namespace!,
      payloadStorage: null,
    });
    for (let index = 0; index < 105; index += 1) {
      handles.push(await client.workflow.start(workflowType, {
        workflowId: randomUUID(),
        taskQueue: workflowType,
        searchAttributes: { ProjectId: [projectId], ProjectVersion: [1] },
      }));
    }
    parent = await client.workflow.start(`${workflowType}_Parent`, {
      workflowId: randomUUID(),
      taskQueue: `${workflowType}_Parent`,
      searchAttributes: { ProjectId: [projectId], ProjectVersion: [2] },
    });
    handles.push(parent);
    const task = await connection.withDeadline(Date.now() + 30_000, () =>
      connection.workflowService.pollWorkflowTaskQueue({
        namespace,
        taskQueue: { name: `${workflowType}_Parent` },
        identity: "temporal-continuation-regression",
      }),
    );
    await connection.workflowService.respondWorkflowTaskCompleted({
      taskToken: task.taskToken,
      identity: "temporal-continuation-regression",
      commands: children.map((workflowId) => ({
        commandType: temporal.api.enums.v1.CommandType.COMMAND_TYPE_START_CHILD_WORKFLOW_EXECUTION,
        startChildWorkflowExecutionCommandAttributes: {
          namespace,
          workflowId,
          workflowType: { name: `${workflowType}_Child` },
          taskQueue: { name: `${workflowType}_Child` },
          workflowTaskTimeout,
        },
      })),
    });
    const childTask = await connection.withDeadline(Date.now() + 30_000, () =>
      connection.workflowService.pollWorkflowTaskQueue({
        namespace,
        taskQueue: { name: `${workflowType}_Child` },
        identity: "temporal-continuation-regression",
      }),
    );
    await connection.workflowService.respondWorkflowTaskCompleted({
      taskToken: childTask.taskToken,
      identity: "temporal-continuation-regression",
      commands: [{
        commandType: temporal.api.enums.v1.CommandType.COMMAND_TYPE_START_CHILD_WORKFLOW_EXECUTION,
        startChildWorkflowExecutionCommandAttributes: {
          namespace,
          workflowId: grandchildId,
          workflowType: { name: `${workflowType}_Grandchild` },
          taskQueue: { name: `${workflowType}_Grandchild` },
          workflowTaskTimeout,
        },
      }],
    });
    const deadline = Date.now() + 30_000;
    while (true) {
      const roots = await client.workflow.count(`WorkflowType = '${workflowType}'`);
      const history = await parent.fetchHistory();
      const startedChildren = (history.events ?? []).filter((event) => event.childWorkflowExecutionStartedEventAttributes);
      const descendants = await client.workflow.count(`RootWorkflowId = '${parent.workflowId}' AND RootRunId = '${parent.firstExecutionRunId}' AND ParentWorkflowId IS NOT null`);
      if (roots.count === 105 && startedChildren.length === children.length && descendants.count === 106) {
        break;
      }
      if (Date.now() > deadline) throw new Error(
        `Native readiness timed out: roots=${roots.count}, startedChildren=${startedChildren.length}, descendants=${descendants.count}, rootWorkflowId=${parent.workflowId}, rootRunId=${parent.firstExecutionRunId}, workflowType=${workflowType}, grandchildId=${grandchildId}`,
      );
      // Native visibility is eventually consistent; a fake clock cannot advance the server.
      await delay(100);
    }
  }, 120_000);

  afterAll(async () => {
    const cleanup = await Promise.allSettled(handles.map((handle) => handle.terminate("continuation regression complete")));
    await workflows?.close();
    await connection?.close();
    expect(cleanup.filter((result) => result.status === "rejected")).toEqual([]);
  });

  for (const kind of ["project", "type"] as const) {
    test(`${kind} lists expose every matching execution beyond 100 through bounded pages`, async () => {
      const workflowIds: string[] = [];
      let nextPageToken: string | null = null;
      const tokens = new Set<string>();
      do {
        const input = { projectId, projectVersion: 1, pageSize: 17, nextPageToken };
        const page: WorkflowsResponse = kind === "project"
          ? await listWorkflows(workflows, { ...input, executionStatus: "Running" })
          : await listWorkflowsByType(workflows, { ...input, workflowType, executionStatus: "all" });
        expect(page.workflows.length).toBeLessThanOrEqual(17);
        expect(page.workflows.every((workflow) => workflow.projectId === projectId && workflow.projectVersion === 1)).toBe(true);
        expect(page.retrievedWorkflows).toBe(page.workflows.length);
        workflowIds.push(...page.workflows.map((workflow) => workflow.workflowId));
        nextPageToken = page.nextPageToken;
        if (nextPageToken !== null) {
          expect(tokens.has(nextPageToken)).toBe(false);
          tokens.add(nextPageToken);
        }
      } while (nextPageToken !== null);
      expect(workflowIds.sort()).toEqual(handles.slice(0, 105).map((handle) => handle.workflowId).sort());
    });
  }

  for (const kind of ["project", "type"] as const) {
    test(`${kind} exact target remains reachable beyond the first 100 newer workflows`, async () => {
      const input = {
        projectId,
        projectVersion: 1,
        workflowId: handles[0]!.workflowId,
        executionStatus: "Running" as const,
        pageSize: 1,
        nextPageToken: null,
      };
      const page = kind === "project"
        ? await listWorkflows(workflows, input)
        : await listWorkflowsByType(workflows, { ...input, workflowType });
      expect(page.workflows.map((workflow) => workflow.workflowId)).toEqual([input.workflowId]);
      if (page.nextPageToken !== null) {
        const continuation = { ...input, nextPageToken: page.nextPageToken };
        const next = kind === "project"
          ? await listWorkflows(workflows, continuation)
          : await listWorkflowsByType(workflows, { ...continuation, workflowType });
        expect(next.workflows).toEqual([]);
      }
    });
  }

  test("by-type status queries do not report running executions as completed", async () => {
    const page = await listWorkflowsByType(workflows, {
      projectId,
      projectVersion: 1,
      workflowType,
      executionStatus: "Completed",
      pageSize: 1,
      nextPageToken: null,
    });
    expect(page.workflows).toEqual([]);
    expect(page.nextPageToken).toBeNull();
  });

  test("by-type workflowIds queries return only the requested executions", async () => {
    const requested = handles.slice(0, 3).map((handle) => handle.workflowId);
    const page = await listWorkflowsByType(workflows, {
      projectId,
      projectVersion: 1,
      workflowType,
      workflowIds: [...requested, randomUUID()],
      executionStatus: "all",
      pageSize: 100,
      nextPageToken: null,
    });
    expect(page.workflows.map((workflow) => workflow.workflowId).sort()).toEqual([...requested].sort());
    expect(page.nextPageToken).toBeNull();
  });

  test("exact root status queries reach every child and grandchild without child project attributes", async () => {
    const input = {
      projectId,
      projectVersion: 2,
      rootWorkflowId: parent.workflowId,
      rootRunId: parent.firstExecutionRunId,
      executionStatus: "Running" as const,
      pageSize: 17,
    };
    const workflowIds: string[] = [];
    let nextPageToken: string | null = null;
    const tokens = new Set<string>();
    do {
      const page = await listWorkflowsByType(workflows, {
        ...input, workflowType: `${workflowType}_Child`, nextPageToken,
      });
      expect(page.workflows.length).toBeLessThanOrEqual(17);
      workflowIds.push(...page.workflows.map((workflow) => workflow.workflowId));
      nextPageToken = page.nextPageToken;
      if (nextPageToken !== null) {
        expect(tokens.has(nextPageToken)).toBe(false);
        tokens.add(nextPageToken);
      }
    } while (nextPageToken !== null);
    expect(workflowIds.sort()).toEqual([...children].sort());
    const grandchild = await listWorkflowsByType(workflows, {
      ...input, workflowType: `${workflowType}_Grandchild`, pageSize: 1, nextPageToken: null,
    });
    expect(grandchild.workflows.map((workflow) => workflow.workflowId)).toEqual([grandchildId]);
    await expect(listWorkflowsByType(workflows, {
      ...input, projectId: randomUUID(), workflowType: `${workflowType}_Child`, nextPageToken: null,
    })).rejects.toThrow();
  });

  test("history continuation exposes every child beyond 100 with independently loadable runs", async () => {
    const branches = new Map<string, string>();
    let nextPageToken: string | null = null;
    const tokens = new Set<string>();
    do {
      const page = await getExecutionTree(workflows, {
        workflowId: parent.workflowId,
        runId: parent.firstExecutionRunId,
        pageSize: 17,
        nextPageToken,
      });
      expect(page.id).toBe(parent.workflowId);
      expect(page.runId).toBe(parent.firstExecutionRunId);
      expect(page.historyComplete).toBe(page.nextPageToken === null);
      for (const child of page.children) {
        if (child.type === "workflow" && child.runId !== null && child.id !== null) branches.set(child.id, child.runId);
      }
      nextPageToken = page.nextPageToken;
      if (nextPageToken !== null) {
        expect(tokens.has(nextPageToken)).toBe(false);
        tokens.add(nextPageToken);
      }
    } while (nextPageToken !== null);
    expect(tokens.size).toBeGreaterThan(0);
    expect([...branches.keys()].sort()).toEqual([...children].sort());
    const [workflowId, runId] = [...branches.entries()].at(-1)!;
    const branch = await getExecutionTree(workflows, { workflowId, runId, pageSize: 17, nextPageToken: null });
    expect(branch.id).toBe(workflowId);
    expect(branch.runId).toBe(runId);
    expect(branch.name).toBe(`${workflowType}_Child`);
  });

  test("child branch authorization resolves the native root project and binds the exact run", async () => {
    const child = await client.workflow.getHandle(children[0]!).describe();
    expect(child.searchAttributes.ProjectId).toBeUndefined();
    expect(await getWorkflowProject(workflows, {
      workflowId: child.workflowId,
      runId: child.runId,
    })).toEqual({ projectId, runId: child.runId });
  });

  test("system load counts native executions without truncating workflow-type totals", async () => {
    const load = await getSystemLoad(workflows, {
      maxComplexity: 1000,
      defaultWorkflowComplexityWeight: 3,
      workflowComplexity: { [workflowType]: 7 },
    });
    expect(load.breakdown.find((entry) => entry.workflowType === workflowType)).toEqual({
      workflowType,
      runningCount: 105,
      complexityWeight: 7,
      totalComplexity: 735,
    });
    const unconfigured = await client.workflow.count(`ExecutionStatus = 'Running' AND ProjectId IS NOT null AND WorkflowType != '${workflowType}'`);
    expect(unconfigured.count).toBeGreaterThan(0);
    expect(load.breakdown.find((entry) => entry.workflowType === null)).toEqual({
      workflowType: null,
      runningCount: unconfigured.count,
      complexityWeight: 3,
      totalComplexity: unconfigured.count * 3,
    });
  });

  test("reads terminal metadata without retrieving a failed workflow result", async () => {
    const handle = await client.workflow.start(workflowType, {
      workflowId: randomUUID(),
      taskQueue: workflowType,
      searchAttributes: { ProjectId: [projectId], ProjectVersion: [1] },
    });
    await handle.terminate("metadata-only regression");
    const workflow = await getWorkflow(workflows, {
      workflowId: handle.workflowId,
      includeResult: false,
    });
    expect(workflow).toMatchObject({
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: "terminated",
      result: null,
    });
  });
});
