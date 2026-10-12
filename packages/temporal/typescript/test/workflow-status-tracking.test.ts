import { AsyncLocalStorage } from "node:async_hooks";
import { expect, mock, test } from "bun:test";
import type { WorkflowStatusEvent } from "@spark-temporal/contracts";
import type { WorkflowExecuteInput, WorkflowInboundCallsInterceptor } from "@temporalio/workflow";

const reported: WorkflowStatusEvent[] = [];
let parent: { workflowId: string; runId: string; namespace: string } | undefined;

const actual = await import("@temporalio/workflow");
await mock.module("@temporalio/workflow", () => ({
  ...actual,
  AsyncLocalStorage,
  proxySinks: () => ({ sparkTemporalTracking: { report: (event: WorkflowStatusEvent) => reported.push(event) } }),
  workflowInfo: () => ({ workflowId: "workflow", runId: "run", workflowType: "TrackedWorkflow", parent }),
}));
const { interceptors } = await import("../src/workflow-interceptors.ts");

const execute = async (workflowParent: typeof parent) => {
  reported.length = 0;
  parent = workflowParent;
  const [inbound] = interceptors().inbound as WorkflowInboundCallsInterceptor[];
  const input: WorkflowExecuteInput = { args: [], headers: {} };
  await inbound!.execute!(input, async () => "done");
  return reported.map(({ status }) => status);
};

test("a root workflow reports running and completed", async () => {
  expect(await execute(undefined)).toEqual(["running", "completed"]);
});

test("a child workflow reports no status, as the Python tracking did", async () => {
  expect(await execute({ workflowId: "parent", runId: "parent-run", namespace: "default" })).toEqual([]);
});
