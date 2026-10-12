import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import { Value, WorkflowFailureCodeSchema } from "@spark-temporal/contracts";
import { better } from "better-drizzle";
import { Result } from "better-result";
import { log } from "evlog";

import { temporalJobDatabaseSchema } from "./db/schema.ts";
import {
  WorkflowFailureSchema,
  type TemporalStatus,
  type WorkflowFailure,
} from "./schemas.ts";

const FAILURE_STATUSES = new Set<TemporalStatus>(["failed", "canceled", "terminated", "timed_out"]);

const StoredBranchesSchema = WorkflowFailureSchema.properties.branches;

interface FailedRun {
  readonly workflowId: string;
  readonly runId: string;
  readonly status: TemporalStatus | null;
  readonly failure: WorkflowFailure | null;
}

interface StoredFailure {
  readonly failureCode: string | null;
  readonly failureBranches: unknown;
}

/** The failure a run reports from its Temporal status alone, before any stored detail. */
export function statusFailure(status: TemporalStatus | null): WorkflowFailure | null {
  if (status === null || !FAILURE_STATUSES.has(status)) return null;
  switch (status) {
    case "timed_out":
      return { errorCode: "ANALYSIS_TIMED_OUT", branches: [] };
    case "canceled":
    case "terminated":
      return { errorCode: "ANALYSIS_CANCELED", branches: [] };
    default:
      return { errorCode: "ANALYSIS_FAILED", branches: [] };
  }
}

/**
 * Upgrades a status failure with the catalog code and branches the workflow recorded. A row that
 * breaks the contract keeps the status failure, so a failure payload never fails the read.
 */
export function storedFailure(
  status: TemporalStatus | null,
  stored: StoredFailure | undefined,
): WorkflowFailure | null {
  const fallback = statusFailure(status);
  if (fallback === null || stored?.failureCode == null) return fallback;
  if (!Value.Check(WorkflowFailureCodeSchema, stored.failureCode)) return fallback;
  return {
    errorCode: stored.failureCode,
    branches: Value.Check(StoredBranchesSchema, stored.failureBranches)
      ? stored.failureBranches
      : [],
  };
}

const runKey = (workflowId: string, runId: string) => `${workflowId}\u0000${runId}`;

/**
 * Reads the recorded failures of one page's failed runs in a single query. A database error keeps
 * every status failure and is logged, because the workflow read must not fail over a failure detail.
 */
export async function withStoredFailures<Run extends FailedRun>(
  postgres: PostgresScope<typeof temporalJobDatabaseSchema>,
  runs: readonly Run[],
): Promise<Run[]> {
  const failed = runs.filter(({ failure }) => failure !== null);
  if (failed.length === 0) return [...runs];
  const rows = await Result.tryPromise(() =>
    postgres.query((transaction) =>
      better(transaction, { schema: temporalJobDatabaseSchema }).workflowExecutions.findMany({
        where: {
          OR: failed.map(({ workflowId, runId }) => ({ workflowId, runId })),
        },
        select: { workflowId: true, runId: true, failureCode: true, failureBranches: true },
      }),
    ),
  );
  if (rows.isErr()) {
    log.warn({ message: "Unable to read recorded workflow failures", error: rows.error });
    return [...runs];
  }
  const byRun = new Map(rows.value.map((row) => [runKey(row.workflowId, row.runId), row]));
  return runs.map((run) =>
    run.failure === null
      ? run
      : { ...run, failure: storedFailure(run.status, byRun.get(runKey(run.workflowId, run.runId))) },
  );
}
