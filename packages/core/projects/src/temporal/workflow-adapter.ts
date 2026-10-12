import {
  CancellationScope,
  executeChild,
  isCancellation,
  patched,
  proxyActivities,
  uuid4,
  workflowInfo,
  type RetryPolicy,
} from "@temporalio/workflow";
import {
  INHALTSEXTRAKTION_QDRANT_SOURCE_FILE_CLEANUP_COMPENSATION_WORKFLOW,
  INHALTSEXTRAKTION_QDRANT_SOURCE_FILE_CLEANUP_WORKFLOW,
  INHALTSEXTRAKTION_TASK_QUEUE,
  type CreateProjectVersionInput,
  type QdrantSourceFileCleanupWorkflow,
} from "@spark-temporal/contracts";

import type { ProjectLogicActivities } from "./activities.ts";
import {
  emptyFileDiff,
  type DeleteProjectWorkflowInput,
  type ProjectInitializationWorkflowInput,
} from "./contracts.ts";
import type { ProjectLogicWorkflowRuntime } from "./workflow-logic.ts";
import {
  runCreateProjectVersionWorkflow,
  runDeleteProjectWorkflow,
  runProjectInitializationWorkflow,
} from "./workflow-logic.ts";

const mainRetry = {
  initialInterval: "5 seconds",
  maximumInterval: "5 seconds",
  maximumAttempts: 20,
} satisfies RetryPolicy;
const cleanupRetry = {
  initialInterval: "5 seconds",
  maximumInterval: "30 seconds",
} satisfies RetryPolicy;
const onceRetry = {
  initialInterval: "10 seconds",
  maximumInterval: "1 minute",
  maximumAttempts: 1,
} satisfies RetryPolicy;

const initialization = proxyActivities<
  Pick<
    ProjectLogicActivities,
    "initializeFcsRequiredDocumentTypes" | "assignVaeTemplate" | "updateProjectStatus"
  >
>({ startToCloseTimeout: "10 seconds", retry: onceRetry });
const deletion = proxyActivities<Pick<ProjectLogicActivities, "deleteProject">>({
  startToCloseTimeout: "10 seconds",
  retry: onceRetry,
});
const lookupActivities = proxyActivities<
  Pick<ProjectLogicActivities, "getLatestPlsVersion" | "getProjectInternalStatus">
>({ startToCloseTimeout: "30 seconds", retry: mainRetry });
const lockActivities = proxyActivities<
  Pick<
    ProjectLogicActivities,
    | "acquireProjectVersionLock"
    | "releaseProjectVersionLock"
    | "copyProjectRootVersion"
    | "undoProjectRootVersion"
  >
>({ startToCloseTimeout: "5 seconds", retry: mainRetry });
const cleanupActivities = proxyActivities<
  Pick<
    ProjectLogicActivities,
    | "releaseProjectVersionLock"
    | "undoProjectRootVersion"
    | "undoServiceVersion"
    | "prepareProjectVersionRollback"
  >
>({ startToCloseTimeout: "5 seconds", retry: cleanupRetry });
const cancellationActivities = proxyActivities<
  Pick<ProjectLogicActivities, "cancelProjectVersionWorkflows">
>({ startToCloseTimeout: "30 seconds", retry: mainRetry });
const planningActivities = proxyActivities<
  Pick<ProjectLogicActivities, "buildProjectVersionCopyPlan">
>({ startToCloseTimeout: "10 minutes", retry: mainRetry });
const copyActivities = proxyActivities<Pick<ProjectLogicActivities, "copyServiceVersionNodes">>({
  startToCloseTimeout: "30 seconds",
  retry: mainRetry,
});
const dmsDiffActivities = proxyActivities<Pick<ProjectLogicActivities, "getDmsZipDiff">>({
  startToCloseTimeout: "5 seconds",
  retry: mainRetry,
});
const dmsApprovalActivities = proxyActivities<
  Pick<ProjectLogicActivities, "updateDmsZipApprovalStatus">
>({ startToCloseTimeout: "5 seconds", retry: mainRetry });
const dmsCommitActivities = proxyActivities<Pick<ProjectLogicActivities, "commitDmsZipDiff">>({
  startToCloseTimeout: "10 minutes",
  retry: mainRetry,
});
const decoupledActivities = proxyActivities<{
  startDecoupledParentWorkflow(projectId: string, projectVersion: number): Promise<string>;
}>({ startToCloseTimeout: "30 seconds", retry: { maximumAttempts: 1 } });

function context(): { projectId: string; projectVersion: number } | undefined {
  const projectId = workflowInfo().searchAttributes.ProjectId?.[0] as string | undefined;
  const projectVersion = workflowInfo().searchAttributes.ProjectVersion?.[0] as number | undefined;
  return projectId === undefined || projectVersion === undefined
    ? undefined
    : { projectId, projectVersion };
}

const runtime: ProjectLogicWorkflowRuntime = {
  initializeFcs: (...args) => initialization.initializeFcsRequiredDocumentTypes(...args),
  assignTemplate: (...args) => initialization.assignVaeTemplate(...args),
  updateStatus: (...args) => initialization.updateProjectStatus(...args),
  deleteProject: (input) => deletion.deleteProject(input),
  latestVersion: (projectId) => lookupActivities.getLatestPlsVersion(projectId),
  internalStatus: (projectId) => lookupActivities.getProjectInternalStatus(projectId),
  acquireLock: (...args) => lockActivities.acquireProjectVersionLock(...args),
  prepareRollback: (...args) =>
    CancellationScope.nonCancellable(() =>
      cleanupActivities.prepareProjectVersionRollback(...args),
    ),
  releaseLock: (...args) =>
    args[2] === undefined || args[2] === null
      ? lockActivities.releaseProjectVersionLock(...args)
      : CancellationScope.nonCancellable(() =>
          cleanupActivities.releaseProjectVersionLock(...args),
        ),
  cancelProjectWorkflows: (...args) =>
    cancellationActivities.cancelProjectVersionWorkflows(...args),
  dmsDiff: (...args) => dmsDiffActivities.getDmsZipDiff(...args),
  buildCopyPlan: (...args) => planningActivities.buildProjectVersionCopyPlan(...args),
  copyService: (...args) => copyActivities.copyServiceVersionNodes(...args),
  undoService: (...args) =>
    CancellationScope.nonCancellable(() => cleanupActivities.undoServiceVersion(...args)),
  updateDmsApproval: (...args) => dmsApprovalActivities.updateDmsZipApprovalStatus(...args),
  commitDmsDiff: (...args) => dmsCommitActivities.commitDmsZipDiff(...args),
  copyRoot: (...args) => lockActivities.copyProjectRootVersion(...args),
  undoRoot: (...args) =>
    CancellationScope.nonCancellable(() => cleanupActivities.undoProjectRootVersion(...args)),
  cleanupQdrant: (input) =>
    executeChild<QdrantSourceFileCleanupWorkflow>(
      INHALTSEXTRAKTION_QDRANT_SOURCE_FILE_CLEANUP_WORKFLOW,
      {
        args: [input],
        taskQueue: INHALTSEXTRAKTION_TASK_QUEUE,
        workflowId: uuid4(),
        searchAttributes: workflowInfo().searchAttributes,
      },
    ),
  compensateQdrant: (input) =>
    CancellationScope.nonCancellable(() =>
      executeChild<QdrantSourceFileCleanupWorkflow>(
        INHALTSEXTRAKTION_QDRANT_SOURCE_FILE_CLEANUP_COMPENSATION_WORKFLOW,
        {
          args: [input],
          taskQueue: INHALTSEXTRAKTION_TASK_QUEUE,
          workflowId: uuid4(),
          searchAttributes: workflowInfo().searchAttributes,
        },
      ),
    ),
  startFvp: (projectId, projectVersion) =>
    decoupledActivities.startDecoupledParentWorkflow(projectId, projectVersion),
  info() {
    const info = workflowInfo();
    return {
      workflowId: info.workflowId,
      runId: info.runId,
      parentWorkflowId: info.parent?.workflowId,
      rootWorkflowId: info.root?.workflowId,
    };
  },
  projectContext: context,
  isCancellation,
  patched,
};

export function ProjectInitializationWorkflow(input: ProjectInitializationWorkflowInput) {
  return runProjectInitializationWorkflow(input, runtime);
}

export function DeleteProjectWorkflow(input: DeleteProjectWorkflowInput) {
  return runDeleteProjectWorkflow(input, runtime);
}

export function CreateProjectVersionWorkflow(input: CreateProjectVersionInput) {
  return runCreateProjectVersionWorkflow(
    {
      ...input,
      fileDiff: {
        ...emptyFileDiff(),
        ...input.fileDiff,
        deleted: input.fileDiff?.deleted ?? [],
        changed: input.fileDiff?.changed ?? [],
        renamed: input.fileDiff?.renamed ?? [],
      },
    },
    runtime,
  );
}
