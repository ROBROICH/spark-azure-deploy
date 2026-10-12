import { describe, expect, test } from "bun:test"

import {
  ErrorResponseSchema,
  SystemLoadResponseSchema,
  parseReadContract,
} from "./support/read-contracts"

describe("Temporal Job read contracts", () => {
  test("returns only the declared system-load fields", () => {
    const parsed = parseReadContract(SystemLoadResponseSchema, {
      loadPercentage: 0,
      runningWorkflows: 0,
      currentComplexity: 0,
      maxComplexity: 1000,
      breakdown: [],
      silentlyStrippedByParse: true,
    })

    expect(parsed).toEqual({
      loadPercentage: 0,
      runningWorkflows: 0,
      currentComplexity: 0,
      maxComplexity: 1000,
      breakdown: [],
    })
    expect(Object.hasOwn(parsed, "silentlyStrippedByParse")).toBeFalse()
  })

  test("accepts the complete declared error shape", () => {
    expect(
      parseReadContract(ErrorResponseSchema, {
        detail: "An error occurred during workflow retrieval",
      }),
    ).toEqual({ detail: "An error occurred during workflow retrieval" })
  })
})
