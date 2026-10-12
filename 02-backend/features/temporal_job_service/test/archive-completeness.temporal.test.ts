import { afterAll, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { S3Client } from "@aws-sdk/client-s3";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { Client, Connection, type WorkflowHandle } from "@temporalio/client";
import { temporal } from "@temporalio/proto";
import { Result } from "better-result";
import { eq, like } from "drizzle-orm";
import { Redacted } from "effect";
import { createDecipheriv } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { gunzipSync } from "node:zlib";

import type { UnarchivedRow } from "../src/archival/contracts.ts";
import { temporalJobDatabaseSchema, workflowExecutions } from "../src/db/schema.ts";
import { updateWorkflowStatus } from "../src/tracking.ts";

mock.module("@temporalio/activity", () => ({ heartbeat() {} }));
const { archivalActivities } = await import("../src/archival/activities.ts");

const address = process.env.TEMPORAL_JOB_TEST_ADDRESS;
const namespace = process.env.TEMPORAL_JOB_TEST_NAMESPACE;
const databaseUrl = process.env.TEMPORAL_JOB_TYPESCRIPT_DATABASE_URL?.trim();
const fernetKey = "cw_0x689RpI-jtRR7oE8h_eQsKImvJapLeSbXpwF4e4=";
const Command = temporal.api.enums.v1.CommandType;

function decryptFernet(token: Uint8Array): Buffer {
  const bytes = Buffer.from(Buffer.from(token).toString("ascii"), "base64");
  const decipher = createDecipheriv(
    "aes-128-cbc",
    Buffer.from(fernetKey, "base64").subarray(16, 32),
    bytes.subarray(9, 25),
  );
  return Buffer.concat([decipher.update(bytes.subarray(25, -32)), decipher.final()]);
}

const closingCommands = {
  completed: {
    commandType: Command.COMMAND_TYPE_COMPLETE_WORKFLOW_EXECUTION,
    completeWorkflowExecutionCommandAttributes: {},
  },
  failed: {
    commandType: Command.COMMAND_TYPE_FAIL_WORKFLOW_EXECUTION,
    failWorkflowExecutionCommandAttributes: { failure: { message: "expected" } },
  },
  cancelled: {
    commandType: Command.COMMAND_TYPE_CANCEL_WORKFLOW_EXECUTION,
    cancelWorkflowExecutionCommandAttributes: {},
  },
};

describe.skipIf(address === undefined || namespace === undefined || databaseUrl === undefined)(
  "native archive completeness",
  () => {
    const prefix = `archive-completeness-${crypto.randomUUID()}`;
    const handles: WorkflowHandle[] = [];
    let body: Uint8Array | undefined;
    let puts = 0;
    const objects = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        puts += 1;
        body = new Uint8Array(await request.arrayBuffer());
        return new Response(null);
      },
    });
    const s3 = new S3Client({
      endpoint: objects.url.toString(),
      region: "local",
      forcePathStyle: true,
      credentials: { accessKeyId: "synthetic", secretAccessKey: "synthetic" },
    });
    let postgres: PostgresResourceRuntime<typeof temporalJobDatabaseSchema>;
    let connection: Connection;
    let client: Client;
    let activities: ReturnType<typeof archivalActivities>;

    const stored = async (workflowId: string) =>
      (
        await postgres.query((database) =>
          database
            .select()
            .from(workflowExecutions)
            .where(eq(workflowExecutions.workflowId, workflowId)),
        )
      )[0];

    const close = async (
      handle: WorkflowHandle,
      workflowId: string,
      outcome: "completed" | "failed" | "cancelled" | "continued_as_new",
    ) => {
      const task = await connection.withDeadline(Date.now() + 5_000, () =>
        connection.workflowService.pollWorkflowTaskQueue({
          namespace,
          taskQueue: { name: workflowId },
          identity: "archive-completeness",
        }),
      );
      const command =
        outcome === "continued_as_new"
          ? {
              commandType: Command.COMMAND_TYPE_CONTINUE_AS_NEW_WORKFLOW_EXECUTION,
              continueAsNewWorkflowExecutionCommandAttributes: {
                workflowType: { name: "ArchiveCompleteness" },
                taskQueue: { name: workflowId },
              },
            }
          : closingCommands[outcome];
      await connection.workflowService.respondWorkflowTaskCompleted({
        taskToken: task.taskToken,
        commands: [command],
      });
      if (outcome === "continued_as_new") handles.push(client.workflow.getHandle(workflowId));
      return handle;
    };

    beforeAll(async () => {
      postgres = createPostgresRuntime({ url: databaseUrl!, schema: temporalJobDatabaseSchema });
      await postgres.ready();
      connection = await Connection.connect({ address });
      client = new Client({ connection, namespace });
      activities = archivalActivities(
        postgres,
        client,
        { encode: async (payloads) => payloads, decode: async (payloads) => payloads },
        s3,
        { bucket: "archives", prefix: "history", encryptionKey: Redacted.make(fernetKey) },
      );
    });

    afterAll(async () => {
      for (const handle of handles) {
        if ((await handle.describe()).status.name === "RUNNING") {
          await handle.terminate("archive completeness regression complete");
        }
      }
      await postgres.query((database) =>
        database.delete(workflowExecutions).where(like(workflowExecutions.workflowId, `${prefix}%`)),
      );
      await postgres.close();
      await connection.close();
      s3.destroy();
      await objects.stop(true);
    });

    for (const outcome of [
      "running",
      "completed",
      "failed",
      "cancelled",
      "terminated",
      "timed_out",
      "continued_as_new",
    ] as const) {
      test(`archives a ${outcome} run only with its native closing event`, async () => {
        const workflowId = `${prefix}-${outcome}`;
        const handle = await client.workflow.start("ArchiveCompleteness", {
          workflowId,
          taskQueue: workflowId,
          workflowExecutionTimeout: outcome === "timed_out" ? 100 : undefined,
        });
        handles.push(handle);
        const row = {
          workflowId,
          runId: handle.firstExecutionRunId,
          workflowType: "ArchiveCompleteness",
          projectId: null,
          projectVersion: null,
          status: "completed",
        } satisfies UnarchivedRow;
        await updateWorkflowStatus(postgres, { ...row, timestamp: "2026-10-07T01:00:00Z" });
        if (outcome === "terminated") await handle.terminate("terminal regression");
        if (outcome === "timed_out") {
          const deadline = Date.now() + 10_000;
          while ((await handle.describe()).status.name === "RUNNING") {
            if (Date.now() >= deadline) throw new Error("local workflow did not time out");
            await delay(100);
          }
        }
        if (
          outcome === "completed" ||
          outcome === "failed" ||
          outcome === "cancelled" ||
          outcome === "continued_as_new"
        ) {
          await close(handle, workflowId, outcome);
        }

        const before = puts;
        const result = await Result.tryPromise(() => activities.archivalArchiveOne({ row }));
        if (outcome === "running") {
          expect(result.status).toBe("error");
          expect(puts).toBe(before);
          expect((await stored(workflowId))?.historyS3Key).toBeNull();
          return;
        }
        expect(result.status).toBe("ok");
        expect(puts).toBe(before + 1);
        expect((await stored(workflowId))?.historyS3Key).toBe(result.unwrap());
        const archive = JSON.parse(gunzipSync(decryptFernet(body!)).toString("utf8"));
        expect(archive.runId).toBe(row.runId);
        expect(archive.events.at(-1).event_type).toBe(
          `EVENT_TYPE_WORKFLOW_EXECUTION_${outcome === "cancelled" ? "CANCELED" : outcome.toUpperCase()}`,
        );
        if (outcome !== "completed") return;

        const incomplete = spyOn(client.workflow, "getHandle").mockReturnValue({
          ...handle,
          fetchHistory: async () => ({ events: [] }),
        });
        try {
          const retried = await Result.tryPromise(() => activities.archivalArchiveOne({ row }));
          expect(retried.status).toBe("error");
          expect(puts).toBe(before + 1);
          expect((await stored(workflowId))?.historyS3Key).toBe(result.unwrap());
        } finally {
          incomplete.mockRestore();
        }
      }, 15_000);
    }
  },
);
