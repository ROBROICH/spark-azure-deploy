import {
  ApplicationFailure,
  ParentClosePolicy,
  executeChild,
  isCancellation,
  proxyActivities,
  startChild,
  uuid4,
  workflowInfo,
} from "@temporalio/workflow";

import {
  DmsSingleFileProcessingInput,
  DmsZipFileProcessingInput,
  AGENT_ORCHESTRATION_EWMS_ORCHESTRATOR_WORKFLOW,
  AGENT_ORCHESTRATION_TASK_QUEUE,
  PROJECT_VERSIONING_CREATE_WORKFLOW,
  PROJECT_VERSIONING_TASK_QUEUE,
  type CreateProjectVersionWorkflow,
  type Static,
} from "@spark-temporal/contracts";

import type { DmsWorkflowRuntime, EwmsChildInput, ProjectVersionChildInput } from "./contracts.ts";
import type { DmsActivities } from "./registrations.ts";
import { runFileProcessingWorkflow, runSingleFileProcessingWorkflow } from "./workflow-logic.ts";

const statusActivities = proxyActivities<
  Pick<DmsActivities, "updateFileStatus" | "updateFileWorkflowStatus" | "updateZipApprovalStatus">
>({ startToCloseTimeout: "30 seconds" });

const validateActivities = proxyActivities<Pick<DmsActivities, "validateZip">>({
  startToCloseTimeout: "30 seconds",
});

const zipActivities = proxyActivities<Pick<DmsActivities, "extractZip">>({
  startToCloseTimeout: "20 minutes",
  retry: {
    initialInterval: "10 seconds",
    maximumInterval: "1 minute",
    maximumAttempts: 50,
  },
});

const cleanupActivities = proxyActivities<Pick<DmsActivities, "deleteZipSource">>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "10 seconds",
    maximumInterval: "1 minute",
    maximumAttempts: 50,
  },
});

const diffActivities = proxyActivities<Pick<DmsActivities, "createDiff">>({
  startToCloseTimeout: "10 minutes",
  retry: {
    initialInterval: "10 seconds",
    maximumInterval: "1 minute",
    maximumAttempts: 50,
  },
});

const mutationActivities = proxyActivities<Pick<DmsActivities, "ingestFile" | "renameFile">>({
  startToCloseTimeout: "10 minutes",
  retry: {
    initialInterval: "10 seconds",
    maximumInterval: "1 minute",
    maximumAttempts: 50,
  },
});

const persistActivities = proxyActivities<Pick<DmsActivities, "persistZipDiff">>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "10 seconds",
    maximumInterval: "1 minute",
    maximumAttempts: 50,
  },
});

const scanActivities = proxyActivities<Pick<DmsActivities, "scanAndUpload">>({
  startToCloseTimeout: "15 minutes",
  retry: {
    initialInterval: "5 seconds",
    maximumInterval: "1 minute",
    maximumAttempts: 5,
    nonRetryableErrorTypes: ["VIRUS_DETECTED"],
  },
});

const runtime: DmsWorkflowRuntime = {
  validateZip: (input) => validateActivities.validateZip(input),
  extractZip: (input) => zipActivities.extractZip(input),
  deleteZipSource: cleanupActivities.deleteZipSource,
  createDiff: (input) => diffActivities.createDiff(input),
  ingestFile: (input) => mutationActivities.ingestFile(input),
  renameFile: (input) => mutationActivities.renameFile(input),
  persistZipDiff: (input) => persistActivities.persistZipDiff(input),
  updateZipStatus: (input) => statusActivities.updateFileStatus(input),
  updateFileStatus: (input) => statusActivities.updateFileWorkflowStatus(input),
  updateZipApprovalStatus: (input) => statusActivities.updateZipApprovalStatus(input),
  scanAndUpload: (input) => scanActivities.scanAndUpload(input),
  async createProjectVersion(input: ProjectVersionChildInput) {
    const result = await executeChild<CreateProjectVersionWorkflow>(
      PROJECT_VERSIONING_CREATE_WORKFLOW,
      {
        args: [input],
        taskQueue: PROJECT_VERSIONING_TASK_QUEUE,
        workflowId: uuid4(),
        workflowTaskTimeout: "60 seconds",
        searchAttributes: workflowInfo().searchAttributes,
      },
    );
    const version = result.newVersion ?? null;
    if (version === null) {
      throw ApplicationFailure.nonRetryable(
        "CreateProjectVersionWorkflow completed without a new version",
        "ProjectVersionUnavailable",
      );
    }
    return version;
  },
  async startEwms(input) {
    await startChild<
      (input: Pick<EwmsChildInput, "projectId" | "fileIds">) => Promise<Record<string, never>>
    >(AGENT_ORCHESTRATION_EWMS_ORCHESTRATOR_WORKFLOW, {
      args: [{ projectId: input.projectId, fileIds: input.fileIds }],
      taskQueue: AGENT_ORCHESTRATION_TASK_QUEUE,
      workflowId: uuid4(),
      workflowTaskTimeout: "60 seconds",
      searchAttributes: workflowInfo().searchAttributes,
      parentClosePolicy: ParentClosePolicy.ABANDON,
    });
  },
  isCancellation,
};

export function createDmsWorkflows(approvalEnabled: boolean) {
  return {
    FileProcessingWorkflow: async (input: Static<typeof DmsZipFileProcessingInput>) =>
      runFileProcessingWorkflow(input, runtime, { approvalEnabled }),
    SingleFileProcessingWorkflow: async (input: Static<typeof DmsSingleFileProcessingInput>) =>
      runSingleFileProcessingWorkflow(input, runtime),
  };
}
