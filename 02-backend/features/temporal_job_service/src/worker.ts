import { S3Client } from "@aws-sdk/client-s3";
import type { PostgreSQLService } from "@spark-workflow/postgres-runtime";
import {
  Client,
  Connection,
  ScheduleAlreadyRunning,
  type ScheduleOptionsAction,
} from "@temporalio/client";
import {
  TEMPORAL_JOB_TASK_QUEUE,
  TEMPORAL_JOB_WEEKLY_ARCHIVAL_WORKFLOW,
} from "@spark-temporal/contracts";
import { createS3PayloadCodec } from "@spark-temporal/typescript/s3-payload-codec";
import { closeAll, startTemporalWorker } from "@spark-temporal/typescript/worker";
import { Redacted } from "effect";

import { archivalActivities } from "./archival/activities.ts";
import { temporalJobDatabaseSchema } from "./db/schema.ts";
import type { TemporalJobWorkerConfiguration } from "./env.ts";
import { updateWorkflowStatus } from "./tracking.ts";
import workflowBundle from "./temporal/workflows.ts?workflow";

interface TemporalJobWorkerOptions {
  readonly configuration: TemporalJobWorkerConfiguration;
  readonly postgres: PostgreSQLService;
}

export async function startTemporalJobWorker({
  configuration,
  postgres,
}: TemporalJobWorkerOptions) {
  if (!configuration.active) return undefined;
  const scope = postgres.scope(temporalJobDatabaseSchema);
  const payloadCodec = createS3PayloadCodec(configuration.payloadStorage);
  const scheduleAction = {
    type: "startWorkflow",
    workflowType: TEMPORAL_JOB_WEEKLY_ARCHIVAL_WORKFLOW,
    workflowId: configuration.schedule.workflowId,
    taskQueue: TEMPORAL_JOB_TASK_QUEUE,
    args: [{ batchSize: configuration.schedule.batchSize }],
  } satisfies ScheduleOptionsAction;
  let archiveObjects: S3Client | undefined;
  let connection: Connection | undefined;

  try {
    archiveObjects = new S3Client({
      endpoint: configuration.archiveStorage.endpoint,
      region: configuration.archiveStorage.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: Redacted.value(configuration.archiveStorage.accessKeyId),
        secretAccessKey: Redacted.value(configuration.archiveStorage.secretAccessKey),
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    connection = await Connection.connect({ address: configuration.temporalHost });
    const temporal = new Client({
      connection,
      namespace: configuration.temporalNamespace,
    });
    try {
      await temporal.schedule.create({
        scheduleId: configuration.schedule.workflowId,
        spec: { cronExpressions: [configuration.schedule.cron] },
        action: scheduleAction,
      });
    } catch (error) {
      if (!(error instanceof ScheduleAlreadyRunning)) throw error;
      await temporal.schedule.getHandle(configuration.schedule.workflowId).update((previous) => ({
        spec: { cronExpressions: [configuration.schedule.cron] },
        action: scheduleAction,
        policies: previous.policies,
        state: previous.state,
      }));
    }
    const ownedArchiveObjects = archiveObjects;
    return startTemporalWorker({
      targetHost: configuration.temporalHost,
      namespace: configuration.temporalNamespace,
      taskQueue: TEMPORAL_JOB_TASK_QUEUE,
      maxConcurrentActivities: configuration.maxConcurrentActivities,
      maxTaskQueueActivitiesPerSecond: configuration.maxTaskQueueActivitiesPerSecond,
      workflowBundle,
      activities: archivalActivities(scope, temporal, payloadCodec, archiveObjects, {
        bucket: configuration.archiveStorage.bucket,
        prefix: configuration.archiveStorage.prefix,
        encryptionKey: configuration.archiveStorage.encryptionKey,
      }),
      payloadCodec,
      reportWorkflowStatus: (request) => updateWorkflowStatus(scope, request),
      ownedResources: [connection, { close: () => ownedArchiveObjects.destroy() }],
    });
  } catch (error) {
    const failure =
      error instanceof Error
        ? error
        : new Error("Temporal Job worker startup failed", { cause: error });
    return closeAll(
      "Failed to start and clean up Temporal Job worker",
      [() => connection?.close(), () => archiveObjects?.destroy(), () => payloadCodec.close()],
      failure,
    );
  }
}
