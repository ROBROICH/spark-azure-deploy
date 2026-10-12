import { Client } from "@temporalio/client";
import type { InjectedSinks, WorkerOptions } from "@temporalio/worker";
import { NativeConnection } from "@temporalio/worker/lib/connection.js";
import { DefaultLogger } from "@temporalio/worker/lib/logger.js";
import { Runtime } from "@temporalio/worker/lib/runtime.js";
import { Worker } from "@temporalio/worker/lib/worker.js";
import type { DataConverter, PayloadCodec } from "@temporalio/common";
import type { Sinks } from "@temporalio/workflow";
import { log } from "evlog";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import type { Static } from "@spark-temporal/contracts";
import { WorkflowStatusEvent } from "@spark-temporal/contracts";

import { createTemporalWorkerInterceptors } from "./context";

const evlogLevels = {
  TRACE: "debug",
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
} as const;

interface CloseableResource {
  close(): void | Promise<void>;
}

export function closeAll(
  message: string,
  closers: readonly (() => void | Promise<void>)[],
): Promise<void>;
export function closeAll(
  message: string,
  closers: readonly (() => void | Promise<void>)[],
  initialError: Error,
): Promise<never>;
export async function closeAll(
  message: string,
  closers: readonly (() => void | Promise<void>)[],
  initialError?: Error,
): Promise<void> {
  const errors = initialError === undefined ? [] : [initialError];
  for (const close of closers) {
    try {
      await close();
    } catch (error) {
      errors.push(
        error instanceof Error ? error : new Error("Temporal cleanup failed", { cause: error }),
      );
    }
  }
  if (errors.length === 1) throw errors[0]!;
  if (errors.length > 1) throw new AggregateError(errors, message);
}

interface WorkerStartOptions {
  readonly targetHost: string;
  readonly namespace: string;
  readonly taskQueue: string;
  readonly workflowBundle: NonNullable<WorkerOptions["workflowBundle"]>;
  readonly activities: NonNullable<WorkerOptions["activities"]>;
  readonly maxConcurrentActivities?: number;
  readonly maxTaskQueueActivitiesPerSecond?: number;
  readonly payloadCodec?: PayloadCodec & CloseableResource;
  readonly reportWorkflowStatus?: (
    event: Static<typeof WorkflowStatusEvent>,
  ) => void | Promise<void>;
  readonly ownedResources?: readonly CloseableResource[];
}

interface SparkTemporalSinks extends Sinks {
  sparkTemporalTracking: {
    report(event: Static<typeof WorkflowStatusEvent>): void;
  };
}

const serviceInstanceId = randomUUID();

export async function startTemporalWorker(options: WorkerStartOptions) {
  let connection: NativeConnection | undefined;
  try {
    const ownedResources = options.ownedResources ?? [];
    const dataConverter: DataConverter = {
      payloadCodecs: options.payloadCodec === undefined ? [] : [options.payloadCodec],
    };
    const sinks: InjectedSinks<SparkTemporalSinks> = {
      sparkTemporalTracking: {
        report: {
          callDuringReplay: false,
          fn(_info, event) {
            return options.reportWorkflowStatus?.(event);
          },
        },
      },
    };

    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const http = process.env.OTEL_EXPORTER_OTLP_PROTOCOL === "http/protobuf";
    Runtime.defaultOptions = {
      ...Runtime.defaultOptions,
      shutdownSignals: [],
      logger: new DefaultLogger("INFO", ({ level, message, meta }) =>
        log[evlogLevels[level]]({ ...meta, message }),
      ),
      telemetryOptions: {
        logging: { forward: {} },
        metrics: endpoint
          ? {
              attachServiceName: false,
              globalTags: {
                service_name: process.env.OTEL_SERVICE_NAME ?? "temporal-worker",
                service_instance_id: serviceInstanceId,
              },
              otel: {
                url: http ? `${endpoint.replace(/\/$/, "")}/v1/metrics` : endpoint,
                http,
                metricsExportInterval: "10 seconds",
                useSecondsForDurations: true,
                temporality: "cumulative",
                histogramBucketOverrides: {
                  workflow_endtoend_latency: [
                    1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600, 7200, 21600, 86400, 604800,
                  ],
                },
              },
            }
          : undefined,
      },
    };
    connection = await NativeConnection.connect({ address: options.targetHost });
    const workerConnection = connection;
    const worker = await Worker.create({
      connection: workerConnection,
      namespace: options.namespace,
      taskQueue: options.taskQueue,
      workflowBundle: options.workflowBundle,
      activities: options.activities,
      dataConverter,
      interceptors: createTemporalWorkerInterceptors(),
      sinks,
      shutdownGraceTime: "10 seconds",
      shutdownForceTime: "15 seconds",
      maxConcurrentActivityTaskExecutions: options.maxConcurrentActivities,
      maxTaskQueueActivitiesPerSecond: options.maxTaskQueueActivitiesPerSecond,
    });
    const done = worker.run();
    const collectionAbort = new AbortController();
    const collection = endpoint
      ? collectWorkflowMetrics({
          connection: workerConnection,
          namespace: options.namespace,
          taskQueue: options.taskQueue,
          signal: collectionAbort.signal,
        })
      : Promise.resolve();
    void done.then(
      () => collectionAbort.abort(),
      () => collectionAbort.abort(),
    );

    return {
      done,
      async close() {
        await closeAll("Failed to close Temporal worker", [
          async () => {
            if (worker.getState() === "RUNNING") worker.shutdown();
            await done;
          },
          async () => {
            collectionAbort.abort();
            await collection;
          },
          () => workerConnection.close(),
          ...ownedResources.map((resource) => () => resource.close()),
          () => options.payloadCodec?.close(),
        ]);
      },
    } as const;
  } catch (error) {
    const failure =
      error instanceof Error
        ? error
        : new Error("Temporal worker startup failed", { cause: error });
    return closeAll(
      "Failed to start and clean up Temporal worker",
      [
        () => connection?.close(),
        ...(options.ownedResources ?? []).map((resource) => () => resource.close()),
        () => options.payloadCodec?.close(),
      ],
      failure,
    );
  }
}

async function collectWorkflowMetrics({
  connection,
  namespace,
  taskQueue,
  signal,
}: {
  connection: NativeConnection;
  namespace: string;
  taskQueue: string;
  signal: AbortSignal;
}): Promise<void> {
  const client = new Client({ connection, namespace });
  const meter = Runtime.instance().metricMeter.withTags({ namespace, task_queue: taskQueue });
  const fields = [
    "running",
    "oldest_running_age_seconds",
    "recent_failed",
    "recent_timed_out",
  ] as const;
  const gauges = fields.map((field) => ({
    field,
    gauge: meter.createGauge(`temporal_workflow_${field}`, "float"),
  }));
  const healthy = meter.createGauge("temporal_workflow_collection_healthy");
  const updated = meter.createGauge("temporal_workflow_collection_timestamp_seconds", "float");
  const knownTypes = new Set<string>();
  healthy.set(0);
  updated.set(0);

  try {
    while (!signal.aborted) {
      const now = Date.now();
      const query = `TaskQueue = ${JSON.stringify(taskQueue)} AND (ExecutionStatus = "Running" OR (ExecutionStatus IN ("Failed", "TimedOut") AND CloseTime > "${new Date(now - 900_000).toISOString()}"))`;
      const values = new Map<string, Record<(typeof fields)[number], number>>();
      try {
        await connection.withAbortSignal(signal, () =>
          connection.withDeadline(now + 45_000, async () => {
            for await (const run of client.workflow.list({ query, pageSize: 500 })) {
              const counts = values.get(run.type) ?? {
                running: 0,
                oldest_running_age_seconds: 0,
                recent_failed: 0,
                recent_timed_out: 0,
              };
              if (run.status.name === "RUNNING") {
                const age = (now - run.startTime.getTime()) / 1000;
                if (!Number.isFinite(age))
                  throw new Error("Workflow start time missing from Temporal");
                counts.running += 1;
                counts.oldest_running_age_seconds = Math.max(
                  counts.oldest_running_age_seconds,
                  age,
                );
              } else if (run.status.name === "FAILED") {
                counts.recent_failed += 1;
              } else if (run.status.name === "TIMED_OUT") {
                counts.recent_timed_out += 1;
              }
              values.set(run.type, counts);
            }
          }),
        );
        if (signal.aborted) break;
        for (const type of values.keys()) knownTypes.add(type);
        for (const type of knownTypes) {
          for (const { field, gauge } of gauges)
            gauge.set(values.get(type)?.[field] ?? 0, { workflow_type: type });
        }
        updated.set(Date.now() / 1000);
        healthy.set(1);
      } catch (error) {
        if (signal.aborted) break;
        healthy.set(0);
        log.error({ error, taskQueue, message: "Could not collect Temporal workflow state" });
      }
      await delay(60_000, undefined, { signal });
    }
  } catch (error) {
    if (!signal.aborted) throw error;
  } finally {
    healthy.set(0);
  }
}
