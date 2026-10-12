import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { EvlogError } from "evlog";
import { describe, expect, test } from "bun:test";

import { startWithConflictMapping } from "../src/routes/workflow-start-conflict.ts";

const rejectWith = async (error: Error): Promise<Error> => {
  try {
    await startWithConflictMapping<never>(() => Promise.reject(error));
  } catch (thrown) {
    return thrown as Error;
  }
  throw new Error("the start must not resolve");
};

describe("workflow start conflict mapping", () => {
  test("returns the started run when Temporal accepts the start", async () => {
    expect(await startWithConflictMapping(async () => ({ workflowId: "FVPWorkflow-1-v3" }))).toEqual(
      { workflowId: "FVPWorkflow-1-v3" },
    );
  });

  test("maps an already-started execution to the catalog conflict", async () => {
    const cause = new WorkflowExecutionAlreadyStartedError(
      "Workflow execution already started",
      "FVPWorkflow-81000000-0000-4000-8000-000000000001-v3",
      "FVPWorkflow",
    );

    const thrown = await rejectWith(cause);

    expect(EvlogError.isEvlogError(thrown)).toBe(true);
    expect(thrown).toMatchObject({
      code: "agent-orchestration.WORKFLOW_ALREADY_STARTED",
      status: 409,
      message: "Workflow execution already started",
      cause,
    });
  });

  test("rethrows an unrelated start failure unchanged", async () => {
    const cause = new Error("temporal is unavailable");

    expect(await rejectWith(cause)).toBe(cause);
  });
});
