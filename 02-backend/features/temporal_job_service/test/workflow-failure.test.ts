import { describe, expect, test } from "bun:test"
import type { PostgresScope } from "@spark-workflow/postgres-runtime"
import type { WorkflowFailureBranch } from "@spark-temporal/contracts"

import type { temporalJobDatabaseSchema } from "../src/db/schema.ts"
import type { WorkflowFailure } from "../src/schemas.ts"
import { statusFailure, storedFailure, withStoredFailures } from "../src/workflow-failure.ts"

const branches: WorkflowFailureBranch[] = [
  { branch: "formalpruefung", errorCode: "ANALYSIS_TIMED_OUT" },
]

describe("statusFailure", () => {
  test("derives the code from a failure status", () => {
    expect(statusFailure("failed")).toEqual({ errorCode: "ANALYSIS_FAILED", branches: [] })
    expect(statusFailure("timed_out")).toEqual({ errorCode: "ANALYSIS_TIMED_OUT", branches: [] })
    expect(statusFailure("canceled")).toEqual({ errorCode: "ANALYSIS_CANCELED", branches: [] })
    expect(statusFailure("terminated")).toEqual({ errorCode: "ANALYSIS_CANCELED", branches: [] })
  })

  test("reports no failure for a run that did not fail", () => {
    for (const status of ["completed", "running", "continued_as_new", "pending", null] as const) {
      expect(statusFailure(status)).toBeNull()
    }
  })
})

describe("storedFailure", () => {
  test("upgrades a failed run with its recorded code and branches", () => {
    expect(
      storedFailure("failed", { failureCode: "ANALYSIS_FAILED", failureBranches: branches }),
    ).toEqual({ errorCode: "ANALYSIS_FAILED", branches })
    expect(storedFailure("failed", { failureCode: "ZIP_INVALID", failureBranches: null })).toEqual({
      errorCode: "ZIP_INVALID",
      branches: [],
    })
  })

  test("keeps the status failure for a missing, unknown, or malformed record", () => {
    const fallback: WorkflowFailure = { errorCode: "ANALYSIS_FAILED", branches: [] }
    expect(storedFailure("failed", undefined)).toEqual(fallback)
    expect(storedFailure("failed", { failureCode: null, failureBranches: null })).toEqual(fallback)
    expect(storedFailure("failed", { failureCode: "SomeInternalError", failureBranches: branches })).toEqual(
      fallback,
    )
    expect(
      storedFailure("failed", {
        failureCode: "ANALYSIS_FAILED",
        failureBranches: [{ branch: "formalpruefung", errorCode: "BOOM" }],
      }),
    ).toEqual(fallback)
  })

  test("never reports a failure for a completed run", () => {
    expect(storedFailure("completed", { failureCode: "ANALYSIS_FAILED", failureBranches: branches })).toBeNull()
  })
})

describe("withStoredFailures", () => {
  const failingScope: PostgresScope<typeof temporalJobDatabaseSchema> = {
    query: async () => {
      throw new Error("database unavailable")
    },
    streamRows: async function* () {
      yield* []
    },
    transact: async (callback) => callback(),
  }
  const runs = [
    { workflowId: "done", runId: "r1", status: "completed" as const, failure: null },
    { workflowId: "broken", runId: "r2", status: "failed" as const, failure: statusFailure("failed") },
  ]

  test("keeps every status failure when the database read fails", async () => {
    expect(await withStoredFailures(failingScope, runs)).toEqual(runs)
  })

  test("does not query the database when no run failed", async () => {
    let queries = 0
    const countingScope: PostgresScope<typeof temporalJobDatabaseSchema> = {
      ...failingScope,
      query: async () => {
        queries += 1
        return [] as never
      },
    }
    expect(await withStoredFailures(countingScope, [runs[0]!])).toEqual([runs[0]!])
    expect(queries).toBe(0)
  })

  test("upgrades a failed run with its recorded code and branches", async () => {
    const branches = [{ branch: "Inhaltsverzeichnis-Abgleich", errorCode: "ANALYSIS_TIMED_OUT" as const }]
    const recordedScope: PostgresScope<typeof temporalJobDatabaseSchema> = {
      ...failingScope,
      query: async () =>
        [{ workflowId: "broken", runId: "r2", failureCode: "NO_DOCUMENTS", failureBranches: branches }] as never,
    }
    expect(await withStoredFailures(recordedScope, runs)).toEqual([
      runs[0]!,
      { workflowId: "broken", runId: "r2", status: "failed", failure: { errorCode: "NO_DOCUMENTS", branches } },
    ])
  })
})
