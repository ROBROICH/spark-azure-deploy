import { describe, expect } from "bun:test";

import { externalTest, readJson } from "../support/external-app";
import { WorkflowsByTypeResponseSchema, parseReadContract } from "../support/read-contracts";
import { readScenarios } from "../support/read-scenarios";

describe("GET /temporal/workflows/by-type/{project_id}", () => {
  externalTest("returns the requested project, workflow type, and version", async () => {
    const projectId = readScenarios.projects.byTypeChildren;
    const response = await readJson(`/temporal/workflows/by-type/${projectId}?workflowType=FVPWorkflow&projectVersion=7`);
    const body = parseReadContract(WorkflowsByTypeResponseSchema, response.body);
    expect(response.status).toBe(200);
    expect(body.workflows.map((workflow) => [workflow.projectId, workflow.projectVersion, workflow.workflowType])).toEqual([
      [projectId, 7, "FVPWorkflow"],
    ]);
    expect(body.nextPageToken).toBeNull();
  });

  externalTest("maps a declared boundary failure to the incumbent 500 body", async () => {
    const response = await readJson(`/temporal/workflows/by-type/${readScenarios.projects.byTypeBoundaryFailure}?workflowType=BatchMVPWorkflow`);
    expect(response).toEqual({ status: 500, body: { detail: "An error occurred during workflow retrieval" } });
  });

  for (const query of ["workflowType=Bad%22Type", "workflowType=BatchMVPWorkflow&projectVersion=0"]) {
    externalTest(`rejects invalid query ${query}`, async () => {
      const response = await readJson(`/temporal/workflows/by-type/${readScenarios.projects.byTypeEmpty}?${query}`);
      expect(response.status).toBe(422);
    });
  }
});
