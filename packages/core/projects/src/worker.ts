import { PROJECT_VERSIONING_TASK_QUEUE, type WorkflowStatusEvent } from "@spark-temporal/contracts";
import { createS3PayloadCodec } from "@spark-temporal/typescript/s3-payload-codec";
import { closeAll, startTemporalWorker } from "@spark-temporal/typescript/worker";

import type { ProjectLogicScope } from "./db.ts";
import type { ProjectWorkerConfiguration } from "./env.ts";
import { DrizzleProjectLogicActivityRepository } from "./temporal/activity-repository.ts";
import { createProjectLogicActivities } from "./temporal/activities.ts";
import type { ProjectLogicWorkerServices } from "./temporal/services.ts";
import {
  createProjectLogicTemporalAdmin,
  type ProjectLogicTemporalAdmin,
} from "./temporal/temporal-admin.ts";
import workflowBundle from "./temporal/workflow-adapter.ts?workflow";

export async function startProjectLogicTemporalWorker(
  scope: ProjectLogicScope,
  configuration: ProjectWorkerConfiguration,
  services: ProjectLogicWorkerServices,
  reportWorkflowStatus: (event: WorkflowStatusEvent) => Promise<void>,
) {
  const payloadCodec = createS3PayloadCodec(configuration.payloadStorage);
  let temporalAdmin: ProjectLogicTemporalAdmin | undefined;

  try {
    temporalAdmin = await createProjectLogicTemporalAdmin({
      targetHost: configuration.temporalHost,
      namespace: configuration.temporalNamespace,
    });
    const ownedTemporalAdmin = temporalAdmin;
    const activities = createProjectLogicActivities({
      repository: new DrizzleProjectLogicActivityRepository(scope),
      services,
      temporalAdmin: ownedTemporalAdmin,
    });
    return startTemporalWorker({
      targetHost: configuration.temporalHost,
      namespace: configuration.temporalNamespace,
      taskQueue: PROJECT_VERSIONING_TASK_QUEUE,
      maxConcurrentActivities: configuration.maxConcurrentActivities,
      maxTaskQueueActivitiesPerSecond: configuration.maxTaskQueueActivitiesPerSecond,
      workflowBundle,
      activities: {
        ...activities,
        startDecoupledParentWorkflow: (projectId: string, projectVersion: number) =>
          ownedTemporalAdmin.startFvp(projectId, projectVersion),
      },
      payloadCodec,
      reportWorkflowStatus,
      ownedResources: [ownedTemporalAdmin],
    });
  } catch (error) {
    const failure =
      error instanceof Error
        ? error
        : new Error("Project Logic worker startup failed", { cause: error });
    return closeAll(
      "Failed to start and clean up Project Logic worker",
      [() => temporalAdmin?.close(), () => payloadCodec.close()],
      failure,
    );
  }
}
