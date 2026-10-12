import { SERVICE_ORDER } from "./contracts.ts";
import type {
  CreateProjectVersionInput,
  CreateProjectVersionOutput,
  FileDiffSummary,
  QdrantSourceFileCleanupInput,
  QdrantSourceFileCleanupOutput,
} from "@spark-temporal/contracts";

import type {
  CopyPlan,
  DeleteProjectWorkflowInput,
  DmsApprovalStatus,
  NodeReference,
  ProjectInitializationWorkflowInput,
  ServiceName,
  WorkflowResult,
} from "./contracts.ts";
import { DOCUMENT_MANAGEMENT_SERVICE } from "./copy-plan.ts";

const COPY_SERVICES = SERVICE_ORDER.filter(
  (service): service is Exclude<ServiceName, typeof DOCUMENT_MANAGEMENT_SERVICE> =>
    service !== DOCUMENT_MANAGEMENT_SERVICE,
);

export interface ProjectLogicWorkflowRuntime {
  initializeFcs(projectId: string, projectTypeId: string, projectVersion: number): Promise<void>;
  assignTemplate(projectId: string, projectTypeId: string): Promise<void>;
  updateStatus(projectId: string, status: string): Promise<void>;
  deleteProject(input: DeleteProjectWorkflowInput): Promise<void>;
  latestVersion(projectId: string): Promise<number>;
  internalStatus(projectId: string): Promise<string | null>;
  acquireLock(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    zipFileId?: string | null,
  ): Promise<string>;
  releaseLock(projectId: string, lockToken: string, error?: string | null): Promise<void>;
  prepareRollback(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    zipFileId: string | null,
    lockToken: string,
  ): Promise<string>;
  cancelProjectWorkflows(
    projectId: string,
    projectVersion: number,
    excludedWorkflowIds: readonly string[],
  ): Promise<unknown>;
  dmsDiff(projectId: string, zipFileId: string, sourceVersion: number): Promise<FileDiffSummary>;
  buildCopyPlan(projectId: string, sourceVersion: number, diff: FileDiffSummary): Promise<CopyPlan>;
  copyService(
    service: ServiceName,
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    lockToken: string,
    nodes: readonly NodeReference[],
    dryRun: boolean,
  ): Promise<unknown>;
  undoService(
    service: ServiceName,
    projectId: string,
    targetVersion: number,
    lockToken: string,
  ): Promise<unknown>;
  updateDmsApproval(
    projectId: string,
    zipFileId: string,
    status: DmsApprovalStatus,
    error?: string | null,
  ): Promise<unknown>;
  commitDmsDiff(
    projectId: string,
    zipFileId: string,
    sourceVersion: number,
    targetVersion: number,
    lockToken: string,
    dryRun: boolean,
  ): Promise<unknown>;
  copyRoot(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    lockToken: string,
    dryRun: boolean,
  ): Promise<unknown>;
  undoRoot(projectId: string, targetVersion: number, lockToken: string): Promise<unknown>;
  cleanupQdrant(input: QdrantCleanupInput): Promise<QdrantSourceFileCleanupOutput>;
  compensateQdrant(input: QdrantCleanupInput): Promise<QdrantSourceFileCleanupOutput>;
  startFvp(projectId: string, projectVersion: number): Promise<unknown>;
  info(): {
    readonly workflowId: string;
    readonly runId: string;
    readonly parentWorkflowId?: string;
    readonly rootWorkflowId?: string;
  };
  projectContext(): { readonly projectId: string; readonly projectVersion: number } | undefined;
  isCancellation(error: Error): boolean;
  patched(patchId: string): boolean;
}

export type QdrantCleanupInput = QdrantSourceFileCleanupInput;

const emptyDiff = (): FileDiffSummary => ({ deleted: [], changed: [], renamed: [] });
export async function runProjectInitializationWorkflow(
  input: ProjectInitializationWorkflowInput,
  runtime: ProjectLogicWorkflowRuntime,
): Promise<WorkflowResult> {
  const version = input.projectVersion ?? 1;
  try {
    await runtime.initializeFcs(input.projectId, input.projectTypeId, version);
    await runtime.assignTemplate(input.projectId, input.projectTypeId);
    const context = runtime.projectContext();
    if (context === undefined || context.projectVersion === 1) {
      await runtime.updateStatus(input.projectId, "UPLOAD_DOCUMENTS");
    }
    return { status: "COMPLETED", message: "Project initialized successfully" };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    if (runtime.isCancellation(failure)) {
      return { status: "CANCELED", message: "ProjectInitialization workflow has been canceled" };
    }
    throw error;
  }
}

export function runDeleteProjectWorkflow(
  input: DeleteProjectWorkflowInput,
  runtime: ProjectLogicWorkflowRuntime,
): Promise<void> {
  return runtime.deleteProject(input);
}

export async function runCreateProjectVersionWorkflow(
  input: CreateProjectVersionInput,
  runtime: ProjectLogicWorkflowRuntime,
): Promise<CreateProjectVersionOutput> {
  const fencedCompensation = runtime.patched("project-version-fenced-compensation");
  let rollbackSourceVersion: number | undefined;
  let targetVersion: number | undefined;
  let lockToken: string | undefined;
  const startedServices = new Set<string>();
  let dmsCommitStarted = false;
  let rootCopyStarted = false;
  let qdrantInput: QdrantCleanupInput | undefined;

  try {
    const sourceVersion = await runtime.latestVersion(input.projectId);
    rollbackSourceVersion = sourceVersion;
    const currentStatus = await runtime.internalStatus(input.projectId);
    if (currentStatus === "UPLOAD_DOCUMENTS") {
      if (input.zipFileId !== undefined && input.zipFileId !== null) {
        targetVersion = sourceVersion;
        lockToken = await runtime.acquireLock(
          input.projectId,
          sourceVersion,
          targetVersion,
          input.zipFileId,
        );
        await runtime.updateDmsApproval(input.projectId, input.zipFileId, "APPROVING");
        await runtime.commitDmsDiff(
          input.projectId,
          input.zipFileId,
          sourceVersion,
          targetVersion,
          lockToken,
          true,
        );
        await runtime.commitDmsDiff(
          input.projectId,
          input.zipFileId,
          sourceVersion,
          targetVersion,
          lockToken,
          false,
        );
        await runtime.updateDmsApproval(input.projectId, input.zipFileId, "APPROVED");
        await runtime.releaseLock(input.projectId, lockToken, null);
        lockToken = undefined;
        await runtime.updateStatus(input.projectId, "OPEN");
        return {
          status: "COMPLETED",
          newVersion: sourceVersion,
          idMappings: null,
          message: `First approved upload: no version bump. Approved ZIP diff was committed at v=${sourceVersion}; project status moved to OPEN.`,
        };
      }
      await runtime.updateStatus(input.projectId, "OPEN");
      return {
        status: "COMPLETED",
        newVersion: sourceVersion,
        idMappings: null,
        message: `First upload: no version bump. Files will be ingested at v=${sourceVersion}; project status moved to OPEN.`,
      };
    }

    targetVersion = sourceVersion + 1;
    lockToken = await runtime.acquireLock(
      input.projectId,
      sourceVersion,
      targetVersion,
      input.zipFileId ?? null,
    );
    const context = runtime.projectContext();
    if (
      context !== undefined &&
      (context.projectId !== input.projectId || context.projectVersion !== sourceVersion)
    ) {
      throw new Error(
        `CreateProjectVersionWorkflow project context does not match source version ${sourceVersion} for project ${input.projectId}`,
      );
    }
    const info = runtime.info();
    const excluded = new Set(
      [info.workflowId, info.parentWorkflowId, info.rootWorkflowId].filter(
        (value): value is string => value !== undefined,
      ),
    );
    await runtime.cancelProjectWorkflows(input.projectId, sourceVersion, [...excluded].sort());

    let fileDiff = input.fileDiff ?? emptyDiff();
    if (input.zipFileId !== undefined && input.zipFileId !== null) {
      await runtime.updateDmsApproval(input.projectId, input.zipFileId, "APPROVING");
      fileDiff = await runtime.dmsDiff(input.projectId, input.zipFileId, sourceVersion);
    }
    const plan = await runtime.buildCopyPlan(input.projectId, sourceVersion, fileDiff);
    await Promise.all([
      ...COPY_SERVICES.map((service) =>
        runtime.copyService(
          service,
          input.projectId,
          sourceVersion,
          targetVersion!,
          lockToken!,
          plan.survivorsPerService[service] ?? [],
          true,
        ),
      ),
      ...(input.zipFileId === undefined || input.zipFileId === null
        ? []
        : [
            runtime.commitDmsDiff(
              input.projectId,
              input.zipFileId,
              sourceVersion,
              targetVersion,
              lockToken,
              true,
            ),
          ]),
      runtime.copyRoot(input.projectId, sourceVersion, targetVersion, lockToken, true),
    ]);

    if (fencedCompensation) rootCopyStarted = true;
    await runtime.copyRoot(input.projectId, sourceVersion, targetVersion, lockToken, false);
    rootCopyStarted = true;
    for (const service of COPY_SERVICES) {
      if (fencedCompensation) startedServices.add(service);
      await runtime.copyService(
        service,
        input.projectId,
        sourceVersion,
        targetVersion,
        lockToken,
        plan.survivorsPerService[service] ?? [],
        false,
      );
      startedServices.add(service);
    }
    if (input.zipFileId !== undefined && input.zipFileId !== null) {
      dmsCommitStarted = true;
      await runtime.commitDmsDiff(
        input.projectId,
        input.zipFileId,
        sourceVersion,
        targetVersion,
        lockToken,
        false,
      );
    }
    if (plan.deletedFileIds.length > 0) {
      qdrantInput = {
        projectId: input.projectId,
        sourceFileIds: [...plan.deletedFileIds],
        marker: `${info.workflowId}:${info.runId}:${targetVersion}`,
        projectVersion: targetVersion,
      };
      await runtime.cleanupQdrant(qdrantInput);
    }
    if (input.zipFileId !== undefined && input.zipFileId !== null) {
      await runtime.updateDmsApproval(input.projectId, input.zipFileId, "APPROVED");
    }
    await runtime.releaseLock(input.projectId, lockToken, null);
    lockToken = undefined;

    await runtime.startFvp(input.projectId, targetVersion);
    return {
      status: "COMPLETED",
      newVersion: targetVersion,
      idMappings: null,
      message: `Version ${targetVersion} created. Cascade-dropped ${plan.deletedKeysCount} nodes.`,
    };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    if (
      rollbackSourceVersion !== undefined &&
      targetVersion !== undefined &&
      lockToken !== undefined
    ) {
      if (fencedCompensation && (rootCopyStarted || startedServices.size > 0 || dmsCommitStarted)) {
        lockToken = await runtime.prepareRollback(
          input.projectId,
          rollbackSourceVersion,
          targetVersion,
          input.zipFileId ?? null,
          lockToken,
        );
      }
      // A failed search-index restore stays in this workflow's history as a failed child; it
      // must not skip the source-of-truth rollback, the approval status or the lock release.
      if (qdrantInput !== undefined)
        await runtime.compensateQdrant(qdrantInput).catch(() => undefined);
      await Promise.all([
        ...COPY_SERVICES.filter((service) => startedServices.has(service)).map((service) =>
          runtime.undoService(service, input.projectId, targetVersion!, lockToken!),
        ),
        ...(dmsCommitStarted
          ? [
              runtime.undoService(
                DOCUMENT_MANAGEMENT_SERVICE,
                input.projectId,
                targetVersion,
                lockToken,
              ),
            ]
          : []),
      ]);
      if (rootCopyStarted) {
        await runtime.undoRoot(input.projectId, targetVersion, lockToken);
        rootCopyStarted = false;
      }
    }
    if (runtime.isCancellation(failure)) {
      if (lockToken !== undefined)
        await runtime.releaseLock(input.projectId, lockToken, "Workflow canceled");
      return { status: "CANCELED", message: "Workflow canceled" };
    }
    const detail = "Project version creation failed";
    try {
      if (input.zipFileId !== undefined && input.zipFileId !== null) {
        await runtime.updateDmsApproval(input.projectId, input.zipFileId, "FAILED_APPROVE", detail);
      }
    } catch (reportingFailure) {
      if (!runtime.patched("project-version-release-after-reporting-failure")) {
        throw reportingFailure;
      }
    }
    if (lockToken !== undefined) await runtime.releaseLock(input.projectId, lockToken, detail);
    throw error;
  }
}
