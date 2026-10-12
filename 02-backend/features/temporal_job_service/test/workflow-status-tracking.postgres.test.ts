import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { S3Client } from "@aws-sdk/client-s3";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { Client } from "@temporalio/client";
import { Redacted } from "effect";
import { and, eq, like } from "drizzle-orm";

import { archivalActivities } from "../src/archival/activities.ts";
import { temporalJobDatabaseSchema, workflowExecutions } from "../src/db/schema.ts";
import type { StatusRequest } from "../src/schemas.ts";
import { createWorkflowStatusReporter } from "../src/tracking.ts";

const databaseUrl = process.env.TEMPORAL_JOB_TYPESCRIPT_DATABASE_URL?.trim();
const prefix = `tjs-status-${crypto.randomUUID()}`;
const projectId = "61000000-0000-4000-8000-000000000001";
const branches = [{ branch: "formalpruefung", errorCode: "ANALYSIS_TIMED_OUT" as const }];

const event = (
  name: string,
  status: StatusRequest["status"],
  timestamp: string,
  extra: Partial<StatusRequest> = {},
): StatusRequest => ({
  workflowId: `${prefix}-${name}`,
  runId: `${prefix}-${name}-run`,
  workflowType: "FVPWorkflow",
  status,
  timestamp,
  ...extra,
});

describe.skipIf(databaseUrl === undefined)("workflow status tracking in PostgreSQL", () => {
  let postgres: PostgresResourceRuntime<typeof temporalJobDatabaseSchema>;
  let report: ReturnType<typeof createWorkflowStatusReporter>;

  const row = async (name: string) => {
    const rows = await postgres.query((database) =>
      database
        .select()
        .from(workflowExecutions)
        .where(eq(workflowExecutions.workflowId, `${prefix}-${name}`)),
    );
    return rows;
  };

  beforeAll(async () => {
    postgres = createPostgresRuntime({
      url: databaseUrl!,
      schema: temporalJobDatabaseSchema,
      pool: { maxConnections: 4 },
    });
    await postgres.ready();
    report = createWorkflowStatusReporter(postgres);
  });

  afterAll(async () => {
    await postgres.query((database) =>
      database.delete(workflowExecutions).where(like(workflowExecutions.workflowId, `${prefix}%`)),
    );
    await postgres.close();
  });

  test("records a run as running and then completed on one row", async () => {
    await report(
      event("lifecycle", "running", "2026-10-07T08:00:00.000Z", { projectId, projectVersion: 2 }),
    );
    expect(await row("lifecycle")).toEqual([
      expect.objectContaining({
        status: "running",
        projectId,
        projectVersion: 2,
        startTime: new Date("2026-10-07T08:00:00.000Z"),
        endTime: null,
      }),
    ]);

    await report(event("lifecycle", "completed", "2026-10-07T08:05:00.000Z"));
    expect(await row("lifecycle")).toEqual([
      expect.objectContaining({
        status: "completed",
        projectId,
        projectVersion: 2,
        startTime: new Date("2026-10-07T08:00:00.000Z"),
        endTime: new Date("2026-10-07T08:05:00.000Z"),
      }),
    ]);
  });

  test("keeps one completed row when running and completed arrive together", async () => {
    await Promise.all([
      report(event("concurrent", "running", "2026-10-07T09:00:00.000Z")),
      report(event("concurrent", "completed", "2026-10-07T09:00:01.000Z")),
    ]);
    const rows = await row("concurrent");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("completed");
  });

  test("records the failure code and branches of failed and cancelled runs", async () => {
    for (const [status, failureCode] of [
      ["failed", "ANALYSIS_FAILED"],
      ["cancelled", "ANALYSIS_CANCELED"],
    ] as const) {
      await report(event(status, "running", "2026-10-07T10:00:00.000Z"));
      await report(
        event(status, status, "2026-10-07T10:01:00.000Z", {
          failureMessage: "Workflow failed",
          failureCode,
          failureBranches: branches,
        }),
      );
      expect(await row(status)).toEqual([
        expect.objectContaining({ status, failureCode, failureBranches: branches }),
      ]);
    }
  });

  test("archives a completed run and archives it again after a later terminal report", async () => {
    const activities = archivalActivities(
      postgres,
      new Client(),
      { encode: async (payloads) => payloads, decode: async (payloads) => payloads },
      new S3Client({ region: "eu-central-1" }),
      { bucket: "unused", prefix: "unused", encryptionKey: Redacted.make("unused") },
    );
    const listed = async () =>
      (await activities.archivalListUnarchivedBatch({ batchSize: 1_000, excludedKeys: [] }))
        .map(({ workflowId }) => workflowId)
        .filter((workflowId) => workflowId.startsWith(prefix));

    await report(event("archived", "completed", "2026-10-07T11:00:00.000Z"));
    expect(await listed()).toContain(`${prefix}-archived`);

    await postgres.query((database) =>
      database
        .update(workflowExecutions)
        .set({ historyS3Key: "archive/key.json" })
        .where(
          and(
            eq(workflowExecutions.workflowId, `${prefix}-archived`),
            eq(workflowExecutions.runId, `${prefix}-archived-run`),
          ),
        ),
    );
    expect(await listed()).not.toContain(`${prefix}-archived`);

    await report(event("archived", "failed", "2026-10-07T11:05:00.000Z"));
    await report(event("archived", "completed", "2026-10-07T11:10:00.000Z"));

    expect(await listed()).toContain(`${prefix}-archived`);
    expect((await row("archived"))[0]?.historyS3Key).toBeNull();
  });
});
