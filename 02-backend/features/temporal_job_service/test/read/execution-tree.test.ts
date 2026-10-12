import { describe, expect } from "bun:test";

import { externalTest, readJson } from "../support/external-app";
import { ExecutionTreeResponseSchema, parseReadContract } from "../support/read-contracts";
import { readScenarios } from "../support/read-scenarios";

describe("GET /temporal/workflows/{workflow_id}/execution-tree", () => {
  externalTest("exposes child runs as separate branches rather than complete empty descendants", async () => {
    const response = await readJson(`/temporal/workflows/${readScenarios.workflows.treeNested}/execution-tree`);
    const body = parseReadContract(ExecutionTreeResponseSchema, response.body);
    expect(response.status).toBe(200);
    const child = body.children.find((node) => node.type === "workflow");
    expect(child).toMatchObject({ id: "tree-child", children: null });
    expect(child?.runId).toBe("run-tree-child");
    const branchResponse = await readJson(`/temporal/workflows/${child!.id}/execution-tree?runId=${child!.runId}`);
    const branch = parseReadContract(ExecutionTreeResponseSchema, branchResponse.body);
    expect(branchResponse.status).toBe(200);
    expect(branch.children).toEqual([expect.objectContaining({ type: "activity", id: "activity-2", status: "completed" })]);
  });

  for (const workflowId of [readScenarios.workflows.treeMissing, readScenarios.workflows.treeBoundaryFailure]) {
    externalTest(`maps the ${workflowId} failure`, async () => {
      const response = await readJson(`/temporal/workflows/${workflowId}/execution-tree`);
      expect(response).toEqual({ status: 500, body: { detail: "An error occurred during workflow execution tree retrieval" } });
    });
  }
});
