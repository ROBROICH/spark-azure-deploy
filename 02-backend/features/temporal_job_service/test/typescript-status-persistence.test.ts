import { expect, test } from "bun:test";
import { createPostgresRuntime } from "@spark-workflow/postgres-runtime";
import { like } from "drizzle-orm";

import {
  temporalJobDatabaseSchema,
  workflowExecutions,
} from "../src/db/schema.ts";
import type { StatusRequest } from "../src/schemas.ts";

type StatusTransition = Pick<
  StatusRequest,
  | "status"
  | "timestamp"
  | "failureMessage"
  | "historyS3Key"
  | "failureCode"
  | "failureBranches"
> & { runId?: string };

const configuredBaseUrl =
  process.env.TEMPORAL_JOB_TYPESCRIPT_BASE_URL?.trim();
const configuredDatabaseUrl =
  process.env.TEMPORAL_JOB_TYPESCRIPT_DATABASE_URL?.trim();
const configured =
  configuredBaseUrl !== undefined && configuredDatabaseUrl !== undefined;
const imageStatusTest = configured ? test : test.skip;

imageStatusTest(
  "status HTTP transitions preserve PostgreSQL state through the built image",
  async () => {
    if (configuredBaseUrl === undefined || configuredDatabaseUrl === undefined) {
      throw new Error("Temporal Job image status profile is not configured");
    }
    const baseUrl = new URL(configuredBaseUrl);
    const postgres = createPostgresRuntime({
      url: configuredDatabaseUrl,
      schema: temporalJobDatabaseSchema,
      pool: {
        maxConnections: 2,
        idleTimeoutSeconds: 5,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 60,
        closeTimeoutSeconds: 5,
      },
    });
    await postgres.ready();

    const prefix = `tjs-ts-status-${crypto.randomUUID()}`;
    const workflowId = `${prefix}-workflow`;
    const runId = `${prefix}-run`;
    const pendingAt = "2026-07-18T01:00:00.000Z";
    const runningAt = "2026-07-18T01:01:00.000Z";
    const completedAt = "2026-07-18T01:02:00.000Z";
    const archiveKey = `temporal-history/${prefix}/history.json.gz`;

    const postStatus = (body: StatusTransition) =>
      fetch(new URL("/internal/workflows/status", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflowId: workflowId,
          runId: runId,
          workflowType: "TemporalJobTypescriptTest",
          projectId: "72000000-0000-4000-8000-000000000001",
          projectVersion: 17,
          ...body,
        }),
      });

    await postgres.query(async (database) =>
      database
        .delete(workflowExecutions)
        .where(like(workflowExecutions.workflowId, `${prefix}%`)),
    );
    try {
      const pending = await postStatus({
        status: "pending",
        timestamp: pendingAt,
      });
      expect(pending.status).toBe(204);
      expect(await pending.text()).toBe("");

      const running = await postStatus({
        status: "running",
        timestamp: runningAt,
      });
      expect(running.status).toBe(204);

      const completed = await postStatus({
        status: "completed",
        timestamp: completedAt,
        historyS3Key: archiveKey,
      });
      expect(completed.status).toBe(204);

      const [row] = await postgres.query(async (database) =>
        database
          .select()
          .from(workflowExecutions)
          .where(like(workflowExecutions.workflowId, `${prefix}%`)),
      );
      expect(row).toMatchObject({
        workflowId,
        runId,
        workflowType: "TemporalJobTypescriptTest",
        projectId: "72000000-0000-4000-8000-000000000001",
        projectVersion: 17,
        status: "completed",
        failureMessage: null,
        historyS3Key: archiveKey,
      });
      expect(row?.startTime?.toISOString()).toBe(pendingAt);
      expect(row?.endTime?.toISOString()).toBe(completedAt);

      const backwards = await postStatus({
        status: "pending",
        timestamp: "2026-07-18T01:03:00.000Z",
      });
      expect(backwards.status).toBe(204);
      const [unchanged] = await postgres.query(async (database) =>
        database
          .select()
          .from(workflowExecutions)
          .where(like(workflowExecutions.workflowId, `${prefix}%`)),
      );
      expect(unchanged?.status).toBe("completed");
      expect(unchanged?.endTime?.toISOString()).toBe(completedAt);

      const failedRunId = `${prefix}-failed-run`;
      const branches = [{ branch: "formalpruefung", errorCode: "ANALYSIS_TIMED_OUT" as const }];
      const failedRunning = await postStatus({
        runId: failedRunId,
        status: "running",
        timestamp: runningAt,
      });
      expect(failedRunning.status).toBe(204);
      const failed = await postStatus({
        runId: failedRunId,
        status: "failed",
        timestamp: completedAt,
        failureMessage: "FVPWorkflow failed",
        failureCode: "ANALYSIS_FAILED",
        failureBranches: branches,
      });
      expect(failed.status).toBe(204);
      const failedRows = await postgres.query(async (database) =>
        database
          .select()
          .from(workflowExecutions)
          .where(like(workflowExecutions.runId, failedRunId)),
      );
      expect(failedRows[0]).toMatchObject({
        status: "failed",
        failureMessage: "FVPWorkflow failed",
        failureCode: "ANALYSIS_FAILED",
        failureBranches: branches,
      });

      // The orchestration reporter stores failures only, so its first event inserts the row.
      const failedOnlyRunId = `${prefix}-failed-only-run`;
      const failedOnly = await postStatus({
        runId: failedOnlyRunId,
        status: "failed",
        timestamp: completedAt,
        failureCode: "NO_DOCUMENTS",
        failureBranches: null,
      });
      expect(failedOnly.status).toBe(204);
      const failedOnlyRows = await postgres.query(async (database) =>
        database
          .select()
          .from(workflowExecutions)
          .where(like(workflowExecutions.runId, failedOnlyRunId)),
      );
      expect(failedOnlyRows[0]).toMatchObject({
        status: "failed",
        failureCode: "NO_DOCUMENTS",
        failureBranches: null,
      });
    } finally {
      const remaining = await postgres.query(async (database) => {
        await database
          .delete(workflowExecutions)
          .where(like(workflowExecutions.workflowId, `${prefix}%`));
        return database
          .select({ id: workflowExecutions.id })
          .from(workflowExecutions)
          .where(like(workflowExecutions.workflowId, `${prefix}%`));
      });
      expect(remaining).toEqual([]);
      await postgres.close();
    }
  },
  30_000,
);
