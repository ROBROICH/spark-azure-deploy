import { describe, expect } from "bun:test"

import { externalTest, readJson } from "../support/external-app"
import {
  ErrorResponseSchema,
  WorkflowResponseSchema,
  parseReadContract,
} from "../support/read-contracts"
import { readScenarios } from "../support/read-scenarios"

describe("GET /temporal/workflows/{workflow_id}", () => {
  for (const scenario of [
    { name: "running without result", id: readScenarios.workflows.running },
    { name: "completed with representative result", id: readScenarios.workflows.completed },
  ]) {
    externalTest(`returns ${scenario.name}`, async () => {
      const response = await readJson(`/temporal/workflows/${scenario.id}`)
      const body = parseReadContract(WorkflowResponseSchema, response.body)

      expect(response.status).toBe(200)
      if (scenario.id === readScenarios.workflows.completed) {
        expect(body.result).toEqual(
          expect.objectContaining({ projectVersion: 4, summary: { warnings: 1, labels: ["representative", "stable"] } }),
        )
      }
      expect(body.workflowId).toBe(scenario.id)
      expect(body.runId).toBe(`run-${scenario.id}`)
    })
  }

  for (const scenario of [
    { name: "failed result", id: readScenarios.workflows.failed, status: 500 },
    { name: "canceled result", id: readScenarios.workflows.canceled, status: 500 },
    { name: "missing workflow", id: readScenarios.workflows.missing, status: 404 },
    { name: "RPC failure", id: readScenarios.workflows.rpcFailure, status: 500 },
    { name: "generic failure", id: readScenarios.workflows.genericFailure, status: 500 },
  ]) {
    externalTest(`maps ${scenario.name}`, async () => {
      const response = await readJson(`/temporal/workflows/${scenario.id}`)
      const body = parseReadContract(ErrorResponseSchema, response.body)

      expect(response.status).toBe(scenario.status)
      expect(body).toEqual({ detail: scenario.status === 404
        ? `Workflow does not exist: ${scenario.id}`
        : "An error occurred during workflow retrieval" })
    })
  }
})
