import { activityInfo } from "@temporalio/activity";
import { projectContexts } from "@spark-temporal/typescript/context";

import { projectErrors } from "../errors.ts";

import type { ProjectLogicActivityRepository } from "./activity-repository.ts";
import { buildProjectVersionCopyPlan } from "./copy-plan.ts";
import {
  SERVICE_ORDER,
  emptyFileDiff,
  type ApprovalStatusResponse,
  type CommitDiffResponse,
  type CopyPlan,
  type CopyVersionResponse,
  type DeleteProjectWorkflowInput,
  type DmsApprovalStatus,
  type NodeReference,
  type NodeSummaryRow,
  type ServiceName,
  type TopicNormPayload,
  type UndoVersionResponse,
} from "./contracts.ts";
import type { FileDiffSummary } from "@spark-temporal/contracts";
import type { ProjectLogicWorkerServices } from "./services.ts";
import type { ProjectLogicTemporalAdmin } from "./temporal-admin.ts";

export interface ProjectLogicActivities {
  assignVaeTemplate(projectId: string, projectTypeId: string): Promise<void>;
  initializeFcsRequiredDocumentTypes(
    projectId: string,
    projectTypeId: string,
    projectVersion: number,
  ): Promise<void>;
  updateProjectStatus(projectId: string, status: string): Promise<void>;
  deleteProject(input: DeleteProjectWorkflowInput): Promise<void>;
  getLatestPlsVersion(projectId: string): Promise<number>;
  getProjectInternalStatus(projectId: string): Promise<string | null>;
  listServiceNodes(
    service: ServiceName,
    projectId: string,
    projectVersion: number,
  ): Promise<NodeSummaryRow[]>;
  batchGetServiceNodes(
    service: "projectLogicService",
    projectId: string,
    projectVersion: number,
    nodes: readonly NodeReference[],
  ): Promise<TopicNormPayload[]>;
  buildProjectVersionCopyPlan(
    projectId: string,
    sourceVersion: number,
    fileDiff: FileDiffSummary,
  ): Promise<CopyPlan>;
  cancelProjectVersionWorkflows(
    projectId: string,
    projectVersion: number,
    excludedWorkflowIds: readonly string[],
  ): Promise<{ cancelled: { workflowId: string; runId: string }[]; skipped: string[] }>;
  copyServiceVersionNodes(
    service: ServiceName,
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    lockToken: string,
    nodes: readonly NodeReference[],
    dryRun: boolean,
  ): Promise<CopyVersionResponse>;
  undoServiceVersion(
    service: ServiceName,
    projectId: string,
    targetVersion: number,
    lockToken: string,
  ): Promise<UndoVersionResponse>;
  getDmsZipDiff(
    projectId: string,
    zipFileId: string,
    sourceVersion: number,
  ): Promise<FileDiffSummary>;
  updateDmsZipApprovalStatus(
    projectId: string,
    zipFileId: string,
    status: DmsApprovalStatus,
    error?: string | null,
  ): Promise<ApprovalStatusResponse>;
  commitDmsZipDiff(
    projectId: string,
    zipFileId: string,
    sourceVersion: number,
    targetVersion: number,
    lockToken: string,
    dryRun: boolean,
  ): Promise<CommitDiffResponse>;
  acquireProjectVersionLock(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    zipFileId?: string | null,
  ): Promise<string>;
  prepareProjectVersionRollback(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    zipFileId: string | null,
    lockToken: string,
  ): Promise<string>;
  copyProjectRootVersion(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    lockToken: string,
    dryRun: boolean,
  ): Promise<{ copied: number }>;
  undoProjectRootVersion(
    projectId: string,
    targetVersion: number,
    lockToken: string,
  ): Promise<{ project: number; applicant: number }>;
  releaseProjectVersionLock(
    projectId: string,
    lockToken: string,
    error?: string | null,
  ): Promise<void>;
}

export interface CreateProjectLogicActivitiesOptions {
  readonly repository: ProjectLogicActivityRepository;
  readonly services: ProjectLogicWorkerServices;
  readonly temporalAdmin: Pick<ProjectLogicTemporalAdmin, "listRunning" | "cancel">;
}

const normalizeFileDiff = (value: FileDiffSummary | undefined): FileDiffSummary => ({
  ...emptyFileDiff(),
  ...value,
  deleted: value?.deleted ?? [],
  changed: value?.changed ?? [],
  renamed: value?.renamed ?? [],
});

export function createProjectLogicActivities(
  options: CreateProjectLogicActivitiesOptions,
): ProjectLogicActivities {
  return {
    async assignVaeTemplate(projectId, projectTypeId) {
      const project = projectContexts.getStore();
      if (project === undefined || project.projectId !== projectId) {
        throw projectErrors.INVALID_REQUEST({
          message: "Template initialization requires the original project version context",
        });
      }
      await options.services.administrativeFileDraft.assignTemplate(
        projectId,
        projectTypeId,
        await options.repository.listTopics(projectId),
        project.projectVersion,
      );
    },
    initializeFcsRequiredDocumentTypes: (projectId, projectTypeId, projectVersion) =>
      options.services.formalCompleteness.initializeRequiredDocumentTypes(
        projectId,
        projectTypeId,
        projectVersion,
      ),
    updateProjectStatus: (projectId, status) => options.repository.updateStatus(projectId, status),
    deleteProject: async (input) => {
      let workflowRunId: string | undefined;
      try {
        workflowRunId = activityInfo().workflowExecution?.runId;
      } catch {}
      await options.repository.deleteProject(
        input.projectId,
        input.projectVersion,
        input.workflowActor ?? null,
        workflowRunId,
      );
    },
    getLatestPlsVersion: (projectId) => options.repository.latestVersion(projectId),
    getProjectInternalStatus: (projectId) => options.repository.internalStatus(projectId),
    async listServiceNodes(service, projectId, projectVersion) {
      return (await options.services.nodes[service].listNodes(projectId, projectVersion)).map(
        (node) => ({ ...node, _service: service }),
      );
    },
    async batchGetServiceNodes(_service, projectId, projectVersion, nodes) {
      return options.services.nodes.projectLogicService.batchNodes(
        projectId,
        projectVersion,
        "topicNorms",
        nodes.map(({ id }) => id),
      );
    },
    buildProjectVersionCopyPlan: (projectId, sourceVersion, fileDiff) =>
      buildProjectVersionCopyPlan({
        services: SERVICE_ORDER,
        projectId,
        sourceVersion,
        fileDiff: normalizeFileDiff(fileDiff),
        listNodes: async (service, id, version) =>
          (await options.services.nodes[service].listNodes(id, version)).map((node) => ({
            ...node,
            _service: service,
          })),
        batchNodes: (_service, id, version, nodes) =>
          options.services.nodes.projectLogicService.batchNodes(
            id,
            version,
            "topicNorms",
            nodes.map(({ id }) => id),
          ),
      }),
    async cancelProjectVersionWorkflows(projectId, projectVersion, excludedWorkflowIds) {
      const query = `\`ExecutionStatus\` = "Running" AND \`ProjectId\` = "${projectId}" AND \`ProjectVersion\` = ${projectVersion}`;
      const excluded = new Set(excludedWorkflowIds);
      const cancelled: { workflowId: string; runId: string }[] = [];
      const skipped: string[] = [];
      for await (const execution of options.temporalAdmin.listRunning(query)) {
        if (excluded.has(execution.workflowId)) {
          skipped.push(execution.workflowId);
          continue;
        }
        await options.temporalAdmin.cancel(execution.workflowId, execution.runId);
        cancelled.push({ workflowId: execution.workflowId, runId: execution.runId });
      }
      return { cancelled, skipped };
    },
    copyServiceVersionNodes: (
      service,
      projectId,
      sourceVersion,
      targetVersion,
      lockToken,
      nodes,
      dryRun,
    ) =>
      options.services.nodes[service].copyVersion({
        projectId,
        sourceVersion,
        targetVersion,
        lockToken,
        nodes,
        dryRun,
      }),
    undoServiceVersion: (service, projectId, targetVersion, lockToken) =>
      options.services.nodes[service].undoVersion({ projectId, targetVersion, lockToken }),
    async getDmsZipDiff(projectId, zipFileId, sourceVersion) {
      return normalizeFileDiff(
        await options.services.documentManagement.getZipDiff(projectId, zipFileId, sourceVersion),
      );
    },
    updateDmsZipApprovalStatus: (projectId, zipFileId, status, error = null) =>
      options.services.documentManagement.updateZipApprovalStatus(
        projectId,
        zipFileId,
        status,
        error,
      ),
    commitDmsZipDiff: (projectId, zipFileId, sourceVersion, targetVersion, lockToken, dryRun) =>
      options.services.documentManagement.commitZipDiff({
        projectId,
        zipFileId,
        sourceVersion,
        targetVersion,
        lockToken,
        dryRun,
      }),
    acquireProjectVersionLock: (projectId, sourceVersion, targetVersion, zipFileId = null) => {
      const workflowRunId = activityInfo().workflowExecution?.runId;
      if (workflowRunId === undefined) {
        throw projectErrors.INVALID_REQUEST({
          message: "A project version reservation requires a workflow execution",
        });
      }
      return options.repository.acquireLock(
        projectId,
        sourceVersion,
        targetVersion,
        zipFileId,
        workflowRunId,
      );
    },
    prepareProjectVersionRollback: (projectId, sourceVersion, targetVersion, zipFileId, lockToken) => {
      const workflowRunId = activityInfo().workflowExecution?.runId;
      if (workflowRunId === undefined) {
        throw projectErrors.INVALID_REQUEST({
          message: "Project version rollback requires a workflow execution",
        });
      }
      return options.repository.prepareRollback(
        projectId,
        sourceVersion,
        targetVersion,
        zipFileId,
        lockToken,
        workflowRunId,
      );
    },
    copyProjectRootVersion: (projectId, sourceVersion, targetVersion, lockToken, dryRun) =>
      options.repository.copyRoot(projectId, sourceVersion, targetVersion, lockToken, dryRun),
    undoProjectRootVersion: (projectId, targetVersion, lockToken) =>
      options.repository.undoRoot(projectId, targetVersion, lockToken),
    releaseProjectVersionLock: (projectId, lockToken, error = null) =>
      options.repository.releaseLock(projectId, lockToken, error),
  };
}
