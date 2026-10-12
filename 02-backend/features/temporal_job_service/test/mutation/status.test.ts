import {SQL} from "bun";
import type {HttpJson} from "@spark-workflow/http-host";
import {afterAll, describe, expect, test} from "bun:test";
import {like} from "drizzle-orm";
import {drizzle} from "drizzle-orm/bun-sql";

import {DatabaseCleanupSchema, DatabaseRowsSchema, parseMutationContract, StatusRequestSchema, ValidationErrorResponseSchema, type WorkflowStatusSchema, } from "../support/mutation-contracts";

import type {Static} from "@sinclair/typebox";

import {temporalJobDatabaseSchema, workflowExecutions, } from "../../src/db/schema.ts";

type StatusRequest = Static<typeof StatusRequestSchema>;

const baseUrlValue = process.env.TEMPORAL_JOB_MUTATION_BASE_URL?.trim();
const databaseUrlValue = process.env.TEMPORAL_JOB_MUTATION_DATABASE_URL?.trim();
const configured = baseUrlValue !== undefined && databaseUrlValue !== undefined;
const describeMutationTests = configured ? describe : describe.skip;
const PROJECT_ID = "72000000-0000-4000-8000-000000000001";
const postgres =
  databaseUrlValue === undefined
    ? undefined
    : new SQL(databaseUrlValue, { max: 2, prepare: false });
const mutationDatabase =
  postgres === undefined
    ? undefined
    : drizzle({ client: postgres, schema: temporalJobDatabaseSchema });

afterAll(async () => {
  await postgres?.close();
});

interface MutationResponse {
  status: number;
  text: string;
  body: HttpJson;
  contentType: string;
}

async function observeDatabase(
  command: "read",
  prefix: string,
): Promise<Static<typeof DatabaseRowsSchema>>;
async function observeDatabase(
  command: "cleanup",
  prefix: string,
): Promise<Static<typeof DatabaseCleanupSchema>>;
async function observeDatabase(
  command: "read" | "cleanup",
  prefix: string,
): Promise<Static<typeof DatabaseRowsSchema> | Static<typeof DatabaseCleanupSchema>> {
  if (mutationDatabase === undefined) throw new Error("mutation database is not configured");
  if (!/^tjs-test-[A-Za-z0-9-]+$/.test(prefix)) {
    throw new Error("status database prefix must be a generated tjs-test-* identity");
  }

  const where = like(workflowExecutions.workflowId, `${prefix}%`);
  if (command === "read") {
    const rows = await mutationDatabase
      .select()
      .from(workflowExecutions)
      .where(where)
      .orderBy(workflowExecutions.workflowId, workflowExecutions.runId);
    return parseMutationContract(DatabaseRowsSchema, {
      rows: rows.map((row) => ({
        ...row,
        startTime: row.startTime?.toISOString() ?? null,
        endTime: row.endTime?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  }

  const before = await mutationDatabase.select({ id: workflowExecutions.id }).from(workflowExecutions).where(where);
  await mutationDatabase.delete(workflowExecutions).where(where);
  const remaining = await mutationDatabase.select({ id: workflowExecutions.id }).from(workflowExecutions).where(where);
  return parseMutationContract(DatabaseCleanupSchema, {
    deleted: before.length - remaining.length,
    remaining: remaining.length,
  });
}

async function postStatus(
  request: HttpJson,
  authorization?: string,
): Promise<MutationResponse> {
  if (baseUrlValue === undefined) throw new Error("mutation service is not configured");
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization !== undefined) headers.set("authorization", authorization);
  const response = await fetch(new URL("/internal/workflows/status", baseUrlValue), {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    body: text === "" ? undefined : JSON.parse(text),
    contentType: response.headers.get("content-type") ?? "",
  };
}

function request(
  prefix: string,
  status: Static<typeof WorkflowStatusSchema>,
  timestamp: string,
  overrides: Partial<StatusRequest> = {},
): StatusRequest {
  return parseMutationContract(StatusRequestSchema, {
    workflowId: `${prefix}-workflow`,
    runId: `${prefix}-run`,
    workflowType: "TemporalJobMutationTest",
    status,
    timestamp,
    projectId: PROJECT_ID,
    projectVersion: 17,
    ...overrides,
  });
}

function expectNoContent(response: MutationResponse): void {
  expect(response.status).toBe(204);
  expect(response.text).toBe("");
}

function expectSameInstant(actual: string | null, expected: string): void {
  expect(actual).not.toBeNull();
  expect(new Date(actual as string).toISOString()).toBe(new Date(expected).toISOString());
}

describe("Temporal Job mutation environment", () => {
  test("configures the external API and its PostgreSQL observer together", () => {
    expect(Boolean(baseUrlValue)).toBe(Boolean(databaseUrlValue));
  });
});

describeMutationTests("Temporal Job status mutation contract", () => {
  test("persists pending, running, terminal, archive identity, idempotency, and backward no-ops", async () => {
    const prefix = `tjs-test-status-${crypto.randomUUID()}`;
    const pendingAt = "2026-07-17T08:00:00.000Z";
    const runningAt = "2026-07-17T08:01:00.000Z";
    const completedAt = "2026-07-17T08:02:00.000Z";
    const archiveKey = `temporal-history/${prefix}/workflow/run.json.gz`;
    await observeDatabase("cleanup", prefix);
    try {
      expectNoContent(await postStatus(request(prefix, "pending", pendingAt)));
      expectNoContent(await postStatus(request(prefix, "pending", pendingAt)));
      let rows = (await observeDatabase("read", prefix)).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        workflowId: `${prefix}-workflow`,
        runId: `${prefix}-run`,
        workflowType: "TemporalJobMutationTest",
        projectId: PROJECT_ID,
        projectVersion: 17,
        status: "pending",
        endTime: null,
        failureMessage: null,
        historyS3Key: null,
      });
      expectSameInstant(rows[0]?.startTime ?? null, pendingAt);

      expectNoContent(await postStatus(request(prefix, "running", runningAt)));
      rows = (await observeDatabase("read", prefix)).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe("running");
      expectSameInstant(rows[0]?.startTime ?? null, pendingAt);

      const terminal = request(prefix, "completed", completedAt, {
        historyS3Key: archiveKey,
      });
      expectNoContent(await postStatus(terminal));
      expectNoContent(await postStatus(terminal));
      rows = (await observeDatabase("read", prefix)).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: "completed",
        failureMessage: null,
        historyS3Key: archiveKey,
      });
      expectSameInstant(rows[0]?.startTime ?? null, pendingAt);
      expectSameInstant(rows[0]?.endTime ?? null, completedAt);

      expectNoContent(await postStatus(request(prefix, "pending", "2026-07-17T08:03:00.000Z")));
      expectNoContent(await postStatus(request(prefix, "running", "2026-07-17T08:04:00.000Z")));
      rows = (await observeDatabase("read", prefix)).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "completed", historyS3Key: archiveKey });
      expectSameInstant(rows[0]?.endTime ?? null, completedAt);
    } finally {
      const cleanup = await observeDatabase("cleanup", prefix);
      expect(cleanup.remaining).toBe(0);
    }
  });

  test("freezes missing-row inserts, exact failure limit, invalid values, and terminal replacement", async () => {
    const prefix = `tjs-test-errors-${crypto.randomUUID()}`;
    const runningPrefix = `${prefix}-running`;
    const failedPrefix = `${prefix}-failed`;
    const invalidPrefix = `${prefix}-invalid`;
    const runningAt = "2026-07-17T09:00:00.000Z";
    const failedAt = "2026-07-17T09:01:00.000Z";
    const failure = "x".repeat(500);
    await observeDatabase("cleanup", prefix);
    try {
      expectNoContent(await postStatus(request(runningPrefix, "running", runningAt)));
      expectNoContent(
        await postStatus(request(failedPrefix, "failed", failedAt, { failureMessage: failure })),
      );
      let rows = (await observeDatabase("read", prefix)).rows;
      expect(rows).toHaveLength(2);
      const running = rows.find(({ workflowId }) => workflowId === `${runningPrefix}-workflow`);
      const failed = rows.find(({ workflowId }) => workflowId === `${failedPrefix}-workflow`);
      expect(running?.status).toBe("running");
      expectSameInstant(running?.startTime ?? null, runningAt);
      expect(failed).toMatchObject({
        status: "failed",
        failureMessage: failure,
        historyS3Key: null,
      });
      expectSameInstant(failed?.startTime ?? null, failedAt);
      expectSameInstant(failed?.endTime ?? null, failedAt);

      const tooLong = await postStatus({
        ...request(invalidPrefix, "failed", failedAt),
        failureMessage: "x".repeat(501),
      });
      expect(tooLong.status).toBe(422);
      expect(tooLong.contentType.toLowerCase()).toStartWith("application/json");
      const tooLongBody = parseMutationContract(ValidationErrorResponseSchema, tooLong.body);
      expect(tooLongBody.detail.some(({ loc }) => loc.at(-1) === "failure_message")).toBeTrue();

      const invalidStatus = await postStatus({
        ...request(invalidPrefix, "pending", failedAt),
        status: "not-a-workflow-status",
      });
      expect(invalidStatus.status).toBe(422);
      const invalidStatusBody = parseMutationContract(
        ValidationErrorResponseSchema,
        invalidStatus.body,
      );
      expect(invalidStatusBody.detail.some(({ loc }) => loc.at(-1) === "status")).toBeTrue();
      rows = (await observeDatabase("read", invalidPrefix)).rows;
      expect(rows).toEqual([]);

      const replacementAt = "2026-07-17T09:02:00.000Z";
      expectNoContent(
        await postStatus(
          request(failedPrefix, "terminated", replacementAt, {
            failureMessage: null,
            historyS3Key: `temporal-history/${failedPrefix}/replacement.json.gz`,
          }),
        ),
      );
      const replacement = (await observeDatabase("read", failedPrefix)).rows[0];
      expect(replacement).toMatchObject({
        status: "terminated",
        failureMessage: null,
        historyS3Key: `temporal-history/${failedPrefix}/replacement.json.gz`,
      });
      expectSameInstant(replacement?.endTime ?? null, replacementAt);
    } finally {
      const cleanup = await observeDatabase("cleanup", prefix);
      expect(cleanup.remaining).toBe(0);
    }
  });

  test("keeps the business test auth-disabled for absent and malformed credentials", async () => {
    const prefix = `tjs-test-auth-${crypto.randomUUID()}`;
    await observeDatabase("cleanup", prefix);
    try {
      expectNoContent(
        await postStatus(request(`${prefix}-absent`, "pending", "2026-07-17T10:00:00.000Z")),
      );
      expectNoContent(
        await postStatus(
          request(`${prefix}-malformed`, "pending", "2026-07-17T10:01:00.000Z"),
          "Bearer definitely-not-a-token",
        ),
      );
      const rows = (await observeDatabase("read", prefix)).rows;
      expect(rows.map(({ status }) => status)).toEqual(["pending", "pending"]);
    } finally {
      const cleanup = await observeDatabase("cleanup", prefix);
      expect(cleanup.remaining).toBe(0);
    }
  });
});
