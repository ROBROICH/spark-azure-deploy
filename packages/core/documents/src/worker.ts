import { DOCUMENT_MANAGEMENT_TASK_QUEUE, type WorkflowStatusEvent } from "@spark-temporal/contracts";
import { createS3PayloadCodec } from "@spark-temporal/typescript/s3-payload-codec";
import { startTemporalWorker } from "@spark-temporal/typescript/worker";

import type { DocumentRuntime } from "./runtime.ts";
import type { DocumentWorkerConfiguration } from "./env.ts";
import { DrizzleDmsActivityRepository } from "./temporal/activity-repository.ts";
import { createDmsActivities } from "./temporal/activities.ts";
import approvalWorkflowBundle from "./temporal/workflows-approval.ts?workflow";
import workflowBundle from "./temporal/workflows.ts?workflow";

export function startDmsTemporalWorker(
  runtime: DocumentRuntime,
  configuration: DocumentWorkerConfiguration,
  reportWorkflowStatus: (event: WorkflowStatusEvent) => Promise<void>,
) {
  const workflow = configuration.enableApproval ? approvalWorkflowBundle : workflowBundle;
  const activities = createDmsActivities({
    repository: new DrizzleDmsActivityRepository(runtime.scope, runtime.cleanStorage),
    zipSourceStorage: runtime.quarantineStorage,
    cleanStorage: runtime.cleanStorage,
    scanner: runtime.scanner,
    scanAndPromote: runtime.scanAndPromote,
    config: {
      zipLimits: configuration.zipLimits,
    },
  });

  return startTemporalWorker({
    targetHost: configuration.temporalHost,
    namespace: configuration.temporalNamespace,
    taskQueue: DOCUMENT_MANAGEMENT_TASK_QUEUE,
    maxConcurrentActivities: configuration.maxConcurrentActivities,
    maxTaskQueueActivitiesPerSecond: configuration.maxTaskQueueActivitiesPerSecond,
    workflowBundle: workflow,
    activities,
    payloadCodec: createS3PayloadCodec(configuration.payloadStorage),
    reportWorkflowStatus,
  });
}
