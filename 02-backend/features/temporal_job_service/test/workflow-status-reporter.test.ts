import { afterEach, expect, setSystemTime, test } from "bun:test"
import type { PostgreSQLService, PostgresSchema, PostgresScope } from "@spark-workflow/postgres-runtime"
import { drizzle } from "drizzle-orm/bun-sql"

import type { workflowExecutions } from "../src/db/schema.ts"
import type { StatusRequest } from "../src/schemas.ts"
import { createWorkflowStatusReporter } from "../src/tracking.ts"

const branches = [{ branch: "formalpruefung", errorCode: "ANALYSIS_TIMED_OUT" as const }]
const event = (status: StatusRequest["status"]): StatusRequest => ({
  workflowId: "wf",
  runId: "run",
  workflowType: "FVPWorkflow",
  status,
  timestamp: "2026-09-28T10:00:00.000Z",
  failureCode: "ANALYSIS_FAILED",
  failureBranches: branches,
})

function recordingPostgres(failedWrites: (() => Error)[]) {
  const inserted: (typeof workflowExecutions.$inferInsert)[] = []
  const scope = <Schema extends PostgresSchema>(schema: Schema): PostgresScope<Schema> => {
    const database = Object.assign(drizzle.mock({ schema }), {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: () => ({
        values: (row: typeof workflowExecutions.$inferInsert) => {
          inserted.push(row)
          return { onConflictDoNothing: () => ({ returning: async () => [row] }) }
        },
      }),
      $client: undefined,
    })
    return {
      query: (callback) => callback(database),
      streamRows: async function* () {
        yield* []
      },
      transact: async (callback) => {
        const failure = failedWrites.shift()
        if (failure !== undefined) throw failure()
        return callback()
      },
    }
  }
  const postgres: PostgreSQLService = { scope }
  return { postgres, inserted }
}

afterEach(() => {
  setSystemTime()
})

test("persists every lifecycle status", async () => {
  const { postgres, inserted } = recordingPostgres([])
  const report = createWorkflowStatusReporter(postgres)

  for (const status of ["pending", "running", "completed"] as const) await report(event(status))

  expect(inserted.map(({ status }) => status)).toEqual(["pending", "running", "completed"])
})

test("persists the status row once the database recovers from a transient failure", async () => {
  const { postgres, inserted } = recordingPostgres([() => new Error("connection reset")])

  await createWorkflowStatusReporter(postgres)(event("failed"))

  expect(inserted).toEqual([
    expect.objectContaining({
      workflowId: "wf",
      runId: "run",
      status: "failed",
      failureCode: "ANALYSIS_FAILED",
      failureBranches: branches,
    }),
  ])
})

test("does not retry a write that failed after the retry budget", async () => {
  const { postgres, inserted } = recordingPostgres([
    () => {
      setSystemTime(new Date(Date.now() + 10_000))
      return new Error("connection timeout")
    },
  ])

  await expect(createWorkflowStatusReporter(postgres)(event("failed"))).rejects.toThrow()

  expect(inserted).toEqual([])
})
