import { describe, expect } from "bun:test"

import { externalTest, readJson } from "../support/external-app"
import {
  SystemLoadResponseSchema,
  parseReadContract,
} from "../support/read-contracts"
import { readScenarios } from "../support/read-scenarios"

describe("GET /temporal/load", () => {
  externalTest("returns weighted counts and the unconfigured-type aggregate", async () => {
    const response = await readJson("/temporal/load")
    const body = parseReadContract(SystemLoadResponseSchema, response.body)

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      runningWorkflows: readScenarios.load.expectedRunning,
      currentComplexity: readScenarios.load.expectedComplexity,
      loadPercentage: readScenarios.load.expectedPercentage,
      maxComplexity: readScenarios.load.maxComplexity,
    })
    expect(body.breakdown.find(({ workflowType }) => workflowType === null)).toEqual({
      workflowType: null,
      runningCount: 1,
      complexityWeight: 3,
      totalComplexity: 3,
    })
  })
})
