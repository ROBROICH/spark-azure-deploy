import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { S3Client } from "@aws-sdk/client-s3";
import { Client, Connection } from "@temporalio/client";
import { defaultPayloadConverter, type Payload } from "@temporalio/common";
import { temporal } from "@temporalio/proto";
import { Result } from "better-result";
import { createHash } from "node:crypto";

import { parseTemporalQueryConfiguration } from "../src/env.ts";
import { connectTemporalWorkflows, getSystemLoad, getWorkflow } from "../src/temporal/queries.ts";

const address = process.env.TEMPORAL_JOB_TEST_ADDRESS;
const namespace = process.env.TEMPORAL_JOB_TEST_NAMESPACE;
const encoder = new TextEncoder();
const load = { maxComplexity: 1_000, workflowComplexity: {}, defaultWorkflowComplexityWeight: 3 };

describe.skipIf(address === undefined || namespace === undefined)(
  "native workflow result payloads",
  () => {
    const value = { text: "workflow result ".repeat(10_000) };
    const payload = defaultPayloadConverter.toPayload(value);
    const bytes = temporal.api.common.v1.Payload.encode(payload).finish();
    let gets = 0;
    let objects: ReturnType<typeof Bun.serve>;
    let configuration: ReturnType<typeof parseTemporalQueryConfiguration>;
    let workflows: ReturnType<typeof connectTemporalWorkflows>;
    let connection: Connection;
    let client: Client;

    beforeAll(async () => {
      expect(process.env.SPARK_TEMPORAL_FIXTURE_FILE).toBeUndefined();
      objects = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
          if (request.method !== "GET") return new Response(null, { status: 405 });
          gets += 1;
          return new Response(bytes.slice(), { headers: { "content-type": "application/octet-stream" } });
        },
      });
      configuration = parseTemporalQueryConfiguration({
        TEMPORAL_HOST: address,
        TEMPORAL_NAMESPACE: namespace,
        MAX_SYSTEM_COMPLEXITY: "1000",
        WORKFLOW_COMPLEXITY: "{}",
        DEFAULT_WORKFLOW_COMPLEXITY_WEIGHT: "3",
        TEMPORAL_S3_ENDPOINT_URL: objects.url.toString(),
        TEMPORAL_S3_REGION: "local",
        TEMPORAL_S3_BUCKET_NAME: "payloads",
        TEMPORAL_S3_ACCESS_KEY_ID: "synthetic",
        TEMPORAL_S3_SECRET_ACCESS_KEY: "synthetic",
      });
      workflows = connectTemporalWorkflows(configuration);
      connection = await Connection.connect({ address });
      client = new Client({ connection, namespace });
    });

    afterAll(async () => {
      await workflows.close();
      await connection.close();
      await objects.stop(true);
    });

    for (const version of ["native", "0", "1", "corrupt"] as const) {
      test(`reads a ${version} result without the archival worker`, async () => {
        const workflowId = crypto.randomUUID();
        const handle = await client.workflow.start("PayloadResult", {
          workflowId,
          taskQueue: workflowId,
        });
        const task = await connection.withDeadline(Date.now() + 5_000, () =>
          connection.workflowService.pollWorkflowTaskQueue({
            namespace,
            taskQueue: { name: workflowId },
            identity: "payload-regression",
          }),
        );
        const metadata: NonNullable<Payload["metadata"]> = {
          encoding: encoder.encode("binary/s3-reference"),
          "s3-key": encoder.encode("result"),
        };
        if (version !== "0") {
          metadata["s3-reference-version"] = encoder.encode("1");
          metadata["s3-sha256"] = encoder.encode(
            version === "corrupt" ? "0".repeat(64) : createHash("sha256").update(bytes).digest("hex"),
          );
        }
        await connection.workflowService.respondWorkflowTaskCompleted({
          taskToken: task.taskToken,
          identity: "payload-regression",
          commands: [
            {
              commandType: temporal.api.enums.v1.CommandType.COMMAND_TYPE_COMPLETE_WORKFLOW_EXECUTION,
              completeWorkflowExecutionCommandAttributes: {
                result: {
                  payloads: [version === "native" ? payload : { metadata, data: new Uint8Array() }],
                },
              },
            },
          ],
        });
        const input = { workflowId, runId: handle.firstExecutionRunId };
        const before = gets;
        expect((await getWorkflow(workflows, { ...input, includeResult: false })).result).toBeNull();
        expect(gets).toBe(before);
        const result = await Result.tryPromise(() => getWorkflow(workflows, input));
        if (version === "corrupt") {
          expect(result.isErr() && result.error.message).toContain("checksum mismatch");
          return;
        }
        expect(result.unwrap().result).toEqual(value);
      });
    }

    test("closes a pending acquisition before constructing a query codec", async () => {
      const connected = await Connection.connect({ address });
      const close = spyOn(connected, "close");
      const pending = Promise.withResolvers<Connection>();
      const connect = spyOn(Connection, "connect").mockReturnValueOnce(pending.promise);
      const service = connectTemporalWorkflows(configuration);
      try {
        const read = Result.tryPromise(() => getSystemLoad(service, load));
        const closing = service.close();
        pending.resolve(connected);
        expect((await read).status).toBe("error");
        await closing;
        await service.close();
        expect(close).toHaveBeenCalledTimes(1);
      } finally {
        connect.mockRestore();
        close.mockRestore();
      }
    });

    test("releases the payload codec exactly once when the query service closes", async () => {
      const destroy = spyOn(S3Client.prototype, "destroy");
      const service = connectTemporalWorkflows(configuration);
      const workflowId = crypto.randomUUID();
      const handle = await client.workflow.start("PayloadLifecycle", {
        workflowId,
        taskQueue: workflowId,
      });
      try {
        await getWorkflow(service, {
          workflowId,
          runId: handle.firstExecutionRunId,
          includeResult: false,
        });
        await service.close();
        await service.close();
        expect(destroy).toHaveBeenCalledTimes(1);
      } finally {
        await handle.terminate("payload lifecycle regression complete");
        destroy.mockRestore();
      }
    });

    test("closes the native connection when payload codec construction fails", async () => {
      const connected = await Connection.connect({ address });
      const close = spyOn(connected, "close");
      const connect = spyOn(Connection, "connect").mockResolvedValueOnce(connected);
      const service = connectTemporalWorkflows({
        ...configuration,
        payloadStorage: { ...configuration.payloadStorage!, bucket: " " },
      });
      try {
        const result = await Result.tryPromise(() => getSystemLoad(service, load));
        expect(result.status).toBe("error");
        expect(close).toHaveBeenCalledTimes(1);
        await service.close();
        expect(close).toHaveBeenCalledTimes(1);
      } finally {
        connect.mockRestore();
        close.mockRestore();
      }
    });
  },
);
