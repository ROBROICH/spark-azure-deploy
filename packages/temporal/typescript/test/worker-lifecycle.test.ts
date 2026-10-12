import { expect, mock, test } from "bun:test";
import { runProcess } from "@spark-workflow/test-support";
import type { PayloadCodec } from "@temporalio/common";
import type { Runtime } from "@temporalio/worker/lib/runtime.js";
import { initLogger, type WideEvent } from "evlog";

const CHILD_ARGUMENT = "--worker-lifecycle-probe";

type WorkerState = "INITIALIZED" | "RUNNING" | "STOPPED" | "STOPPING" | "FAILED";

async function workerLifecycleProbe() {
  const events: string[] = [];
  const runtime: Pick<typeof Runtime, "defaultOptions"> = {
    defaultOptions: { shutdownSignals: ["SIGINT"] },
  };
  const logged: WideEvent[] = [];
  initLogger({ silent: true, drain: ({ event }) => void logged.push(event) });

  function fakeWorker(name: "normal" | "failed") {
    let state: WorkerState = "INITIALIZED";
    let resolveDone: (() => void) | undefined;
    let rejectDone: ((error: Error) => void) | undefined;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });

    return {
      getState: () => state,
      run() {
        state = "RUNNING";
        events.push(`run:${name}`);
        if (name === "failed") {
          setTimeout(() => {
            state = "FAILED";
            rejectDone?.(new Error("worker failed"));
          }, 0);
        }
        return done;
      },
      shutdown() {
        if (state !== "RUNNING") throw new Error(`shutdown while ${state}`);
        events.push(`shutdown:${name}`);
        state = "STOPPING";
        state = "STOPPED";
        resolveDone?.();
      },
    };
  }

  const workers = [fakeWorker("normal"), fakeWorker("failed")];
  let workerIndex = 0;
  let connectionIndex = 0;

  await mock.module("@temporalio/worker/lib/connection.js", () => ({
    NativeConnection: {
      async connect() {
        const index = connectionIndex++;
        return {
          async close() {
            events.push(`connection:${index}`);
            if (index === 1) throw new Error("connection failed");
          },
        };
      },
    },
  }));
  await mock.module("@temporalio/worker/lib/runtime.js", () => ({ Runtime: runtime }));
  await mock.module("@temporalio/worker/lib/worker.js", () => ({
    Worker: {
      async create() {
        const worker = workers[workerIndex++];
        if (worker === undefined) throw new Error("Missing fake worker");
        return worker;
      },
    },
  }));

  const { startTemporalWorker } = await import("../src/worker.ts");

  const options = (name: "normal" | "failed") => {
    const codec: PayloadCodec & { close(): Promise<void> } = {
      decode: async (payloads) => payloads,
      encode: async (payloads) => payloads,
      async close() {
        events.push(`codec:${name}`);
      },
    };
    return {
      targetHost: "temporal.invalid:7233",
      namespace: "default",
      taskQueue: name,
      workflowBundle: { code: "" },
      activities: {},
      payloadCodec: codec,
      ownedResources: [
        {
          async close() {
            events.push(`resource:${name}`);
          },
        },
      ],
    };
  };

  const normal = await startTemporalWorker(options("normal"));
  runtime.defaultOptions.logger?.warn("Temporal runtime warning", {
    taskQueue: "normal",
    error: new Error("Temporal failure"),
  });
  await normal.close();
  await normal.done;

  const failed = await startTemporalWorker(options("failed"));
  let doneError = "";
  let closeErrors: string[] = [];
  try {
    await failed.done;
  } catch (error) {
    doneError = error instanceof Error ? error.message : String(error);
  }
  try {
    await failed.close();
  } catch (error) {
    closeErrors = (error instanceof AggregateError ? error.errors : [error]).map((value) =>
      value instanceof Error ? value.message : String(value),
    );
  }

  return {
    closeErrors,
    logged: logged.map(({ level, message, taskQueue, error }) => ({
      level,
      message,
      taskQueue,
      error: error instanceof Error ? error.message : error,
    })),
    doneError,
    events,
    shutdownSignals: runtime.defaultOptions.shutdownSignals,
  };
}

if (Bun.argv.includes(CHILD_ARGUMENT)) {
  console.log(JSON.stringify(await workerLifecycleProbe()));
} else {
  test("exposes worker completion, routes runtime logs into evlog, and cleans up after normal and failed workers", async () => {
    const { exitCode, stdout, stderr } = await runProcess([import.meta.path, CHILD_ARGUMENT]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const output = JSON.parse(stdout);
    expect(output.closeErrors).toEqual(["worker failed", "connection failed"]);
    expect(output.doneError).toBe("worker failed");
    expect(output.events).toEqual(
      expect.arrayContaining([
        "run:normal",
        "shutdown:normal",
        "connection:0",
        "resource:normal",
        "codec:normal",
        "run:failed",
        "connection:1",
        "resource:failed",
        "codec:failed",
      ]),
    );
    expect(output.events).not.toContain("shutdown:failed");
    expect(output.shutdownSignals).toEqual([]);
    expect(output.logged).toEqual([
      {
        level: "warn",
        message: "Temporal runtime warning",
        taskQueue: "normal",
        error: "Temporal failure",
      },
    ]);
  });
}
