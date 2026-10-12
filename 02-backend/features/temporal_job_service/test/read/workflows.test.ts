import { describe, expect } from "bun:test"

import { externalTest, readJson } from "../support/external-app"
import {
  ErrorResponseSchema,
  WorkflowsResponseSchema,
  parseReadContract,
} from "../support/read-contracts"
import { readScenarios } from "../support/read-scenarios"

function workflowsPath(
  projectId: string,
  executionStatus?: string,
  projectVersion?: number,
): string {
  const query = new URLSearchParams({ projectId: projectId })
  if (executionStatus !== undefined) query.set("executionStatus", executionStatus)
  if (projectVersion !== undefined) query.set("projectVersion", String(projectVersion))
  return `/temporal/workflows?${query}`
}

describe("GET /temporal/workflows", () => {
  externalTest("returns an empty project and ignores malformed auth in disabled mode", async () => {
    const response = await readJson(workflowsPath(readScenarios.projects.empty), {
      headers: { authorization: "definitely-not-a-bearer-token" },
    })
    const body = parseReadContract(WorkflowsResponseSchema, response.body)

    expect(response.status).toBe(200)
    expect(body.workflows).toEqual([])
    expect(body.nextPageToken).toBeNull()
  })

  externalTest("returns mixed workflow statuses", async () => {
    const response = await readJson(workflowsPath(readScenarios.projects.mixed))
    const body = parseReadContract(WorkflowsResponseSchema, response.body)

    expect(response.status).toBe(200)
    expect(body.workflows.map(({ workflowId }) => workflowId)).toEqual([
      "mixed-running",
      "mixed-completed",
      "mixed-failed",
    ])
  })

  for (const scenario of [
    { name: "running", project: readScenarios.projects.running, status: "Running" },
    {
      name: "completed current version",
      project: readScenarios.projects.completedCurrent,
      status: "Completed",
      version: 4,
    },
    {
      name: "completed historical version",
      project: readScenarios.projects.completedHistorical,
      status: "Completed",
      version: 2,
    },
    { name: "failed", project: readScenarios.projects.failed, status: "Failed" },
    { name: "canceled", project: readScenarios.projects.canceled, status: "Canceled" },
    { name: "terminated", project: readScenarios.projects.terminated, status: "Terminated" },
    { name: "timed out", project: readScenarios.projects.timedOut, status: "TimedOut" },
    {
      name: "continued as new",
      project: readScenarios.projects.continuedAsNew,
      status: "ContinuedAsNew",
    },
  ]) {
    externalTest(`preserves the ${scenario.name} status filter`, async () => {
      const response = await readJson(
        workflowsPath(scenario.project, scenario.status, scenario.version),
      )
      const body = parseReadContract(WorkflowsResponseSchema, response.body)

      expect(response.status).toBe(200)
      expect(body.retrievedWorkflows).toBe(1)
      expect(body.workflows[0]?.projectId).toBe(scenario.project)
      expect(body.workflows[0]?.status?.replaceAll("_", "")).toBe(scenario.status.toLowerCase())
    })
  }

  externalTest("maps a declared boundary failure to the incumbent 500 body", async () => {
    const response = await readJson(workflowsPath(readScenarios.projects.boundaryFailure))
    const body = parseReadContract(ErrorResponseSchema, response.body)

    expect(response.status).toBe(500)
    expect(body).toEqual({ detail: "An error occurred during workflow retrieval" })
  })

  externalTest("fails closed when no exact fixture exists", async () => {
    const response = await readJson(workflowsPath(readScenarios.projects.missingFixture))
    const body = parseReadContract(ErrorResponseSchema, response.body)

    expect(response.status).toBe(500)
    expect(body).toEqual({ detail: "An error occurred during workflow retrieval" })
  })

  externalTest("rejects invalid query input before the boundary", async () => {
    const response = await readJson(workflowsPath(readScenarios.projects.empty, "NotAStatus", 0))

    expect(response.status).toBe(422)
  })
})
