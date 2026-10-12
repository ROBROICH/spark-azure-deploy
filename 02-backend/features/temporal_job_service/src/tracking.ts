import { persistenceError, type PostgresScope, type PostgreSQLService } from "@spark-workflow/postgres-runtime";
import { Result } from "better-result";
import { and, eq } from "drizzle-orm";
import { setTimeout as sleep } from "node:timers/promises";

import { temporalJobDatabaseSchema, workflowExecutions } from "./db/schema.ts";
import type { StatusRequest, WorkflowTrackingStatus } from "./schemas.ts";

const terminalStatuses = new Set<WorkflowTrackingStatus>([
  "failed",
  "completed",
  "terminated",
  "cancelled",
  "timed_out",
]);

export async function updateWorkflowStatus(
  postgres: PostgresScope<typeof temporalJobDatabaseSchema>,
  request: StatusRequest,
): Promise<void> {
  const result = await Result.tryPromise({
    try: () =>
      postgres.transact(async () =>
        postgres.query(async (transaction) => {
          const run = and(
            eq(workflowExecutions.workflowId, request.workflowId),
            eq(workflowExecutions.runId, request.runId),
          );
          const timestamp = new Date(request.timestamp);
          const terminal = terminalStatuses.has(request.status);
          const inserted = await transaction
            .insert(workflowExecutions)
            .values({
              workflowId: request.workflowId,
              runId: request.runId,
              workflowType: request.workflowType,
              projectId: request.projectId ?? null,
              projectVersion: request.projectVersion ?? null,
              status: request.status,
              startTime: timestamp,
              endTime: terminal ? timestamp : null,
              failureMessage: terminal ? (request.failureMessage ?? null) : null,
              failureCode: terminal ? (request.failureCode ?? null) : null,
              failureBranches: terminal ? (request.failureBranches ?? null) : null,
              historyS3Key: terminal ? (request.historyS3Key ?? null) : null,
            })
            .onConflictDoNothing({
              target: [workflowExecutions.workflowId, workflowExecutions.runId],
            })
            .returning({ id: workflowExecutions.id });
          if (inserted.length > 0) return;

          const [existing] = await transaction
            .select()
            .from(workflowExecutions)
            .where(run)
            .for("update");
          if (existing === undefined) return;
          const context = {
            projectId: existing.projectId ?? request.projectId ?? null,
            projectVersion: existing.projectVersion ?? request.projectVersion ?? null,
          };
          if (terminal) {
            await transaction
              .update(workflowExecutions)
              .set({
                ...context,
                status: request.status,
                endTime: timestamp,
                failureMessage: request.failureMessage ?? null,
                failureCode: request.failureCode ?? null,
                failureBranches: request.failureBranches ?? null,
                historyS3Key: request.historyS3Key ?? null,
              })
              .where(run);
            return;
          }
          await transaction
            .update(workflowExecutions)
            .set({
              ...context,
              status:
                request.status === "running" && existing.status === "pending"
                  ? "running"
                  : existing.status,
            })
            .where(run);
        }),
      ),
    catch: persistenceError,
  });
  if (result.isErr()) throw result.error;
}

// The Temporal SDK logs a throwing sink call and never repeats it, so a brief database outage would
// lose the status. It awaits sink calls before it completes the activation, and one attempt can
// block for the pool's 10 s connection timeout, which equals the default workflow task timeout. So only
// fast failures are retried, while the elapsed time plus the next delay stays within the budget.
const statusWriteRetryDelaysMs = [200, 1_000];
const statusWriteRetryBudgetMs = 2_500;

export function createWorkflowStatusReporter(
  postgres: PostgreSQLService,
): (request: StatusRequest) => Promise<void> {
  const scope = postgres.scope(temporalJobDatabaseSchema);
  return async (request) => {
    const startedAt = Date.now();
    for (const delayMs of statusWriteRetryDelaysMs) {
      try {
        await updateWorkflowStatus(scope, request);
        return;
      } catch (error) {
        if (Date.now() - startedAt + delayMs > statusWriteRetryBudgetMs) throw error;
        await sleep(delayMs);
      }
    }
    await updateWorkflowStatus(scope, request);
  };
}
