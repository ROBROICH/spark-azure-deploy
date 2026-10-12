import { AGENT_ORCHESTRATION_TASK_QUEUE, type WorkflowStatusEvent } from "@spark-temporal/contracts";
import type { ObjectionsService } from "@spark-workflow/objections-management-service/resource";
import { startTemporalWorker } from "@spark-temporal/typescript/worker";
import { createS3PayloadCodec } from "@spark-temporal/typescript/s3-payload-codec";

import { FppClient } from "./external-clients.ts";
import {
  createAosInternalActivityDependencies,
  type AosInternalServices,
} from "./internal-services.ts";
import { createAosObjectionsService } from "./objections.ts";
import type { AosWorkerConfiguration } from "./env.ts";
import type { AosTemporalCommandsService } from "./temporal/commands.ts";
import { createAssessmentActivities } from "./temporal/assessment-activities.ts";
import { createAosActivities } from "./temporal/activities.ts";
import type { AosActivities } from "./temporal/registrations.ts";
import workflowBundle from "./temporal/workflows.ts?workflow";

export interface AosWorkerDependencies extends AosInternalServices {
  readonly objections: ObjectionsService;
  readonly configuration: AosWorkerConfiguration;
  readonly commands: AosTemporalCommandsService;
  /** Persists every lifecycle status a workflow reports, with failure code and branches. */
  readonly reportWorkflowStatus?: (event: WorkflowStatusEvent) => Promise<void>;
}

export function startAosTemporalWorker(dependencies: AosWorkerDependencies) {
  const configuration = dependencies.configuration;
  if (configuration.payloadStorage === null) {
    throw new TypeError("Temporal payload storage is required to start the AOS worker");
  }
  const internal = createAosInternalActivityDependencies(dependencies);
  const activities = {
    ...createAosActivities({
      ...internal,
      fpp: new FppClient(
        configuration.fppCredential,
        configuration.fppDownloadPolicy,
        configuration.maxObjectBytes,
      ),
    }),
    ...createAssessmentActivities({
      ...internal,
      objections: createAosObjectionsService(dependencies.objections),
      suz: { startAndAwait: (input) => dependencies.commands.startAndAwaitSuz(input) },
    }),
  } satisfies AosActivities;

  return startTemporalWorker({
    targetHost: configuration.temporalHost,
    namespace: configuration.temporalNamespace,
    taskQueue: AGENT_ORCHESTRATION_TASK_QUEUE,
    maxConcurrentActivities: configuration.maxConcurrentActivities,
    maxTaskQueueActivitiesPerSecond: configuration.maxTaskQueueActivitiesPerSecond,
    workflowBundle,
    activities,
    payloadCodec: createS3PayloadCodec(configuration.payloadStorage),
    reportWorkflowStatus: dependencies.reportWorkflowStatus,
  });
}
