import { currentAuditContext } from "@spark-workflow/audit-client";
import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import {
  TemporalFixtureDeclaredError,
  TemporalFixtureMatchError,
  TemporalFixtureValidationError,
} from "@spark-temporal/typescript/caller";
import {
  DOCUMENT_MANAGEMENT_FILE_PROCESSING_WORKFLOW,
  DOCUMENT_MANAGEMENT_SINGLE_FILE_PROCESSING_WORKFLOW,
  DOCUMENT_MANAGEMENT_TASK_QUEUE,
  PROJECT_VERSIONING_CREATE_WORKFLOW,
  PROJECT_VERSIONING_TASK_QUEUE,
  type DocumentManagementFileProcessingTemporalInput,
  type DocumentManagementProjectVersionApprovalTemporalInput,
} from "@spark-temporal/contracts";
import { and, asc, desc, eq, inArray, ne, or, type SQL } from "drizzle-orm";

import { dmsModels, type DmsScope } from "../db.ts";
import { fileTopics, files, zipFileDiffEntries, zipFiles } from "../db/schema.ts";
import { conflict, dmsErrors, DmsValidationError, notFound } from "../errors.ts";
import { fileResponse, type FileService } from "../files/file-service.ts";
import { validateFileTopicParents } from "../node/descriptor.ts";
import type { ProjectVersions } from "../../../projects/src/project-versions.ts";
import { apiFileType, databaseFileType } from "../files/file-types.ts";
import { buildObjectPath } from "../files/object-path.ts";
import type { ApprovalActionResponse, FileDiff, FileUpdateRequest } from "../schemas.ts";
import type { S3Storage } from "../storage/s3-storage.ts";
import type { DocumentTemporalCommandsService } from "../temporal/commands.ts";

type FileRow = typeof files.$inferSelect;
type ZipRow = typeof zipFiles.$inferSelect;
type DiffRow = typeof zipFileDiffEntries.$inferSelect;
type DiffDecision =
  | { readonly kind: "new"; readonly entry: FileDiff["new"][number] }
  | { readonly kind: "excluded"; readonly entry: FileDiff["new"][number] }
  | { readonly kind: "deleted"; readonly entry: FileDiff["deleted"][number] }
  | { readonly kind: "changed"; readonly entry: FileDiff["changed"][number] }
  | { readonly kind: "renamed"; readonly entry: FileDiff["renamed"][number] }
  | { readonly kind: "unchanged"; readonly entry: FileDiff["unchanged"][number] };

const workflowActor = () => {
  const context = currentAuditContext();
  return {
    actorUserId: context.actorUserId ?? null,
    triggeredByUserId: context.triggeredByUserId ?? null,
    workflowType: context.workflowType ?? null,
  };
};

const requireDiffValue = (value: string | null, field: string, row: DiffRow): string => {
  if (!value) throw new Error(`ZIP diff row ${row.id} is missing required ${field}`);
  return value;
};

const same = (field: string, expected: string | null, submitted: string | null): void => {
  if (expected !== submitted) throw DmsValidationError({ message: `${field} cannot be changed` });
};

const emptyDiff = (): FileDiff => ({
  new: [],
  deleted: [],
  changed: [],
  renamed: [],
  unchanged: [],
});

const processedJsonFilename = (documentFilename: string): string => {
  const stem = documentFilename.includes(".")
    ? documentFilename.slice(0, documentFilename.lastIndexOf("."))
    : documentFilename;
  const leaf = stem.slice(stem.lastIndexOf("/") + 1);
  return `${stem}/${leaf}_processed.json`;
};

const rowsToDiff = (rows: readonly DiffRow[], useDecision = true): FileDiff => {
  const result = emptyDiff();
  for (const row of rows) {
    const kind = useDecision ? row.decisionKind : row.computedKind;
    if (kind === "excluded") {
      (result.excluded ??= []).push({
        filename: row.filename,
        bucketPath: requireDiffValue(row.bucketPath, "bucket_path", row),
        sha: requireDiffValue(row.sha, "sha", row),
      });
      continue;
    }
    if (kind === "new") {
      if (row.computedKind === "renamed") {
        result.unchanged.push({
          fileId: requireDiffValue(row.fileId, "file_id", row),
          filename: requireDiffValue(row.oldName, "old_name", row),
          sha: requireDiffValue(row.sha, "sha", row),
        });
      }
      result.new.push({
        filename: row.filename,
        bucketPath: requireDiffValue(row.bucketPath, "bucket_path", row),
        sha: requireDiffValue(row.sha, "sha", row),
      });
      continue;
    }
    if (kind === "deleted") {
      result.deleted.push({
        fileId: requireDiffValue(row.fileId, "file_id", row),
        filename: row.filename,
        sha: requireDiffValue(row.sha, "sha", row),
      });
      continue;
    }
    if (kind === "changed") {
      result.changed.push({
        fileId: requireDiffValue(row.fileId, "file_id", row),
        bucketPath: requireDiffValue(row.bucketPath, "bucket_path", row),
        filename: row.filename,
        sourceSha: requireDiffValue(row.sourceSha, "source_sha", row),
        targetSha: requireDiffValue(row.targetSha, "target_sha", row),
      });
      continue;
    }
    if (kind === "renamed") {
      result.renamed.push({
        fileId: requireDiffValue(row.fileId, "file_id", row),
        oldName: requireDiffValue(row.oldName, "old_name", row),
        newName: requireDiffValue(row.newName, "new_name", row),
        sha: requireDiffValue(row.sha, "sha", row),
        bucketPath: row.bucketPath,
      });
      continue;
    }
    result.unchanged.push({
      fileId: requireDiffValue(row.fileId, "file_id", row),
      filename:
        row.computedKind === "renamed"
          ? requireDiffValue(row.oldName, "old_name", row)
          : row.filename,
      sha: requireDiffValue(row.computedKind === "changed" ? row.targetSha : row.sha, "sha", row),
    });
  }
  return result;
};

export class DocumentMutationService {
  constructor(
    private readonly scope: DmsScope,
    private readonly projectVersions: Pick<
      ProjectVersions,
      "ensureWritable" | "latestOne" | "validateVersionLock"
    >,
    private readonly fileService: FileService,
    private readonly cleanStorage: S3Storage,
    private readonly commands: DocumentTemporalCommandsService,
  ) {}

  async fileForAuthorization(
    fileId: string,
    projectVersion?: number,
    includeDeleted = false,
  ): Promise<FileRow> {
    const row = await this.fileService.getFileRow(fileId, projectVersion, includeDeleted);
    if (!row) throw notFound({ message: "File not found" });
    return row;
  }

  private async lockActiveFile(fileId: string, projectVersion: number): Promise<FileRow> {
    const [row] = await this.scope.query((database) =>
      database
        .select()
        .from(files)
        .where(
          and(
            eq(files.id, fileId),
            eq(files.projectVersion, projectVersion),
            eq(files.isDeleted, false),
          ),
        )
        .limit(1)
        .for("update"),
    );
    if (!row) throw notFound({ message: "File not found" });
    return row;
  }

  async zipForAuthorization(zipId: string): Promise<ZipRow | undefined> {
    return this.findZip(zipId);
  }

  private async findZip(zipId: string, projectVersion?: number): Promise<ZipRow | undefined> {
    const conditions: SQL[] = [eq(zipFiles.id, zipId)];
    if (projectVersion !== undefined) conditions.push(eq(zipFiles.projectVersion, projectVersion));
    return this.scope.query(
      async (database) =>
        (await dmsModels(database).zipFiles.findFirst({
          where: and(...conditions),
          orderBy: { projectVersion: "desc" },
        })) ?? undefined,
    );
  }

  private async requireZip(zipId: string, projectVersion?: number): Promise<ZipRow> {
    const row = await this.findZip(zipId, projectVersion);
    if (!row) throw notFound({ message: `Zip file '${zipId}' not found.` });
    return row;
  }

  private async lockZip(zipId: string): Promise<ZipRow> {
    const [zip] = await this.scope.query((database) =>
      database
        .select()
        .from(zipFiles)
        .where(eq(zipFiles.id, zipId))
        .orderBy(desc(zipFiles.projectVersion))
        .limit(1)
        .for("update"),
    );
    if (!zip) throw notFound({ message: `Zip file '${zipId}' not found.` });
    return zip;
  }

  private async diffRows(zipId: string, projectVersion: number): Promise<DiffRow[]> {
    return this.scope.query((database) =>
      database
        .select()
        .from(zipFileDiffEntries)
        .where(
          and(
            eq(zipFileDiffEntries.zipFileId, zipId),
            eq(zipFileDiffEntries.projectVersion, projectVersion),
          ),
        )
        .orderBy(asc(zipFileDiffEntries.filename), asc(zipFileDiffEntries.id)),
    );
  }

  async updateFile(fileId: string, projectVersion: number, input: FileUpdateRequest) {
    const row = await this.fileForAuthorization(fileId, projectVersion);
    return this.scope.transact(async () => {
      if (row.projectId)
        await this.projectVersions.ensureWritable(row.projectId, row.projectVersion);
      const active = await this.lockActiveFile(fileId, projectVersion);
      await this.scope.query(async (database) => {
        if (Object.hasOwn(input, "topics")) {
          const topicIds = input.topics ?? [];
          if (active.projectId) {
            const parents = await validateFileTopicParents(
              database,
              active.projectId,
              [projectVersion],
              topicIds.map((topicId) => ({ topicId })),
            );
            if (parents.isErr()) throw parents.error;
          }
          await database
            .delete(fileTopics)
            .where(
              and(eq(fileTopics.fileId, fileId), eq(fileTopics.projectVersion, projectVersion)),
            );
          if (active.projectId && topicIds.length > 0) {
            await database.insert(fileTopics).values(
              topicIds.map((topicId) => ({
                id: crypto.randomUUID(),
                fileId,
                topicId,
                subtopicId: null,
                projectId: active.projectId,
                projectVersion,
                isDeleted: false,
                isOutdated: false,
                frontendParentIds: [],
                updateType: "AUTOMATED",
              }) satisfies typeof fileTopics.$inferInsert),
            );
          }
        }

        const values: Partial<typeof files.$inferInsert> = {};
        if (input.filename !== undefined) values.filename = input.filename;
        if (Object.hasOwn(input, "vectorSearchable")) {
          values.vectorSearchable = input.vectorSearchable;
        }
        if (Object.keys(values).length > 0) {
          const changed = await database
            .update(files)
            .set(values)
            .where(
              and(
                eq(files.id, fileId),
                eq(files.projectVersion, projectVersion),
                eq(files.isDeleted, false),
              ),
            )
            .returning({ id: files.id });
          if (changed.length === 0) throw notFound({ message: "File not found" });
        }
        if (active.projectId) {
          await recordAuditEntry(database, {
            projectId: active.projectId,
            entityId: fileId,
            entityType: "file",
            changeType: "update",
          });
        }
      });
      return this.fileService.getFile(fileId, projectVersion);
    });
  }

  async deleteFile(fileId: string, projectVersion: number) {
    const row = await this.fileForAuthorization(fileId, projectVersion);
    await this.scope.transact(async () => {
      if (row.projectId)
        await this.projectVersions.ensureWritable(row.projectId, row.projectVersion);
      const active = await this.lockActiveFile(fileId, projectVersion);
      await this.scope.query(async (database) => {
        const changed = await database
          .update(files)
          .set({ isDeleted: true })
          .where(
            and(
              eq(files.id, fileId),
              eq(files.projectVersion, projectVersion),
              eq(files.isDeleted, false),
            ),
          )
          .returning({ id: files.id });
        if (changed.length === 0) throw notFound({ message: "File not found" });
        if (active.projectId) {
          await recordAuditEntry(database, {
            projectId: active.projectId,
            entityId: fileId,
            entityType: "file",
            changeType: "delete",
          });
        }
      });
    });
    const deleted = await this.fileService.getFileRow(fileId, projectVersion, true);
    if (!deleted) throw notFound({ message: `File ${fileId} not found.` });
    const topics = await this.scope.query((database) =>
      database
        .select({ topicId: fileTopics.topicId })
        .from(fileTopics)
        .where(
          and(
            eq(fileTopics.fileId, fileId),
            eq(fileTopics.projectVersion, projectVersion),
            eq(fileTopics.isDeleted, false),
          ),
        ),
    );
    return fileResponse(
      deleted,
      topics.flatMap(({ topicId }) => (topicId === null ? [] : [topicId])),
    );
  }

  private async auditZipAction(projectId: string, zipId: string, actionType: string) {
    await this.scope.query((database) =>
      recordAuditEntry(database, {
        projectId,
        entityId: zipId,
        entityType: "zip_file",
        changeType: "action",
        actionType,
      }),
    );
  }

  private async currentFile(fileId: string): Promise<FileRow | undefined> {
    const candidate = await this.scope.query((database) =>
      dmsModels(database).files.findFirst({
        where: { id: fileId },
        select: { projectId: true, projectVersion: true },
        orderBy: [{ projectVersion: "desc" }, { version: "desc" }],
      }),
    );
    if (!candidate) return undefined;
    const projectVersion = candidate.projectId
      ? await this.projectVersions.latestOne(candidate.projectId)
      : candidate.projectVersion;
    return this.fileService.getFileRow(fileId, projectVersion);
  }

  private async updateFileWorkflowStatus(
    file: FileRow,
    status: FileRow["workflowStatus"],
  ): Promise<void> {
    await this.scope.transact(() =>
      this.scope.query(async (database) => {
        await database
          .update(files)
          .set({ workflowStatus: status })
          .where(and(eq(files.id, file.id), eq(files.projectVersion, file.projectVersion)));
        if (file.projectId) {
          await recordAuditEntry(database, {
            projectId: file.projectId,
            entityId: file.id,
            entityType: "file",
            changeType: "update",
          });
        }
      }),
    );
  }

  private async ensureNoActiveWorkflow(projectId: string): Promise<void> {
    const rows = await this.scope.query((database) =>
      database
        .select({
          workflowStatus: zipFiles.workflowStatus,
          approvalStatus: zipFiles.approvalStatus,
        })
        .from(zipFiles)
        .where(eq(zipFiles.projectId, projectId)),
    );
    if (rows.some(({ workflowStatus }) => workflowStatus === "REQUIRES_APPROVAL")) {
      throw conflict({
        message: `Cannot upload a file or start new ZIP processing for project ${projectId}: existing workflow is in state REQUIRES_APPROVAL.`,
      });
    }
    if (rows.some(({ workflowStatus }) => workflowStatus === "RUNNING")) {
      throw conflict({
        message: `Cannot upload a file or start new ZIP processing for project ${projectId}: existing workflow is in state RUNNING.`,
      });
    }
    if (
      rows.some(
        ({ approvalStatus }) =>
          approvalStatus === "REQUIRES_APPROVAL" || approvalStatus === "APPROVING",
      )
    ) {
      throw conflict({
        message: `Cannot upload a file or start new ZIP processing for project ${projectId}: existing ZIP approval is still active.`,
      });
    }
  }

  async startFileProcessing(input: { readonly fileId: string; readonly projectId: string }) {
    const zip = await this.findZip(input.fileId);
    if (zip) return this.startZipProcessing(input, zip);
    await this.ensureNoActiveWorkflow(input.projectId);
    return this.startSingleFileProcessing(input);
  }

  private async startZipProcessing(
    input: { readonly fileId: string; readonly projectId: string },
    selected: ZipRow,
  ) {
    if (selected.projectId !== input.projectId)
      throw notFound({ message: "File not found in project." });
    const zip = ["RUNNING", "COMPLETED", "REQUIRES_APPROVAL"].includes(selected.workflowStatus)
      ? selected
      : await this.scope.transact(async () => {
          await this.projectVersions.ensureWritable(input.projectId, selected.projectVersion);
          const zip = await this.lockZip(selected.id);
          if (["RUNNING", "COMPLETED", "REQUIRES_APPROVAL"].includes(zip.workflowStatus)) {
            if (zip.workflowId === null)
              throw conflict({ message: "ZIP execution association is unresolved" });
            return zip;
          }
          if (zip.projectVersion !== selected.projectVersion)
            throw conflict({ message: "ZIP version changed before processing admission" });
          await this.ensureNoActiveWorkflow(input.projectId);
          const workflowId = `FileProcessingWorkflow-${input.projectId}-${zip.id}-${crypto.randomUUID()}`;
          const [admitted] = await this.scope.query((database) =>
            database
              .update(zipFiles)
              .set({ workflowId, runId: null, workflowStatus: "RUNNING" })
              .where(and(eq(zipFiles.id, zip.id), eq(zipFiles.projectVersion, zip.projectVersion)))
              .returning(),
          );
          if (!admitted) throw notFound({ message: "ZIP disappeared during processing admission" });
          return admitted;
        });
    if (zip.workflowId === null)
      throw conflict({ message: "ZIP execution association is unresolved" });
    if (zip.runId !== null)
      return { workflowId: zip.workflowId, runId: zip.runId, workflowStatus: zip.workflowStatus };
    await this.auditZipAction(input.projectId, zip.id, "start_file_processing");
    const projectVersion = zip.projectVersion;
    const temporalInput = {
      request: {
        kind: "zip",
        workflowName: DOCUMENT_MANAGEMENT_FILE_PROCESSING_WORKFLOW,
        executionId: zip.workflowId,
        taskQueue: DOCUMENT_MANAGEMENT_TASK_QUEUE,
        projectId: input.projectId,
        projectVersion: projectVersion,
        idReusePolicy: "REJECT_DUPLICATE",
        idConflictPolicy: "USE_EXISTING",
        workflowInput: {
          fileId: zip.id,
          filename: zip.filename,
          projectId: input.projectId,
          fileType: apiFileType(zip.type) === "ewms_zip" ? "ewms_zip" : "zip",
          zipPath: zip.bucketPath,
          entryFileType: apiFileType(zip.type) === "ewms_zip" ? "ewms_document" : "document",
          sourceProjectVersion: projectVersion,
          workflowActor: workflowActor(),
        },
      },
    } satisfies DocumentManagementFileProcessingTemporalInput;
    try {
      const result = await this.commands.startFileProcessing(temporalInput);
      await this.scope.query((database) =>
        database
          .update(zipFiles)
          .set({ runId: result.runId })
          .where(
            and(
              eq(zipFiles.id, zip.id),
              eq(zipFiles.projectVersion, zip.projectVersion),
              eq(zipFiles.workflowId, result.workflowId),
            ),
          ),
      );
      return {
        workflowId: result.workflowId,
        runId: result.runId,
        workflowStatus: result.workflowStatus,
      };
    } catch (error) {
      if (
        error instanceof WorkflowExecutionAlreadyStartedError ||
        (error instanceof TemporalFixtureDeclaredError && error.outcome.kind === "already_started")
      ) {
        throw conflict({
          message: `Cannot start ZIP processing for project ${input.projectId}: another ZIP processing workflow is already running.`,
        });
      }
      throw dmsErrors.TEMPORAL_FAILED({ cause: error instanceof Error ? error : undefined });
    }
  }

  private async startSingleFileProcessing(input: {
    readonly fileId: string;
    readonly projectId: string;
  }) {
    const file = await this.currentFile(input.fileId);
    if (!file) throw notFound({ message: "File not found." });
    if (file.projectId !== input.projectId)
      throw notFound({ message: "File not found in project." });
    const type = apiFileType(file.type);
    if (type !== "document" && type !== "erwiderungs_import" && type !== "template") {
      throw DmsValidationError({
        message: `SingleFileProcessingWorkflow is not supported for file type '${type}'.`,
      });
    }
    const originalStatus = file.workflowStatus ?? "PENDING";
    await this.updateFileWorkflowStatus(file, "RUNNING");
    const temporalInput = {
      request: {
        kind: "single_file",
        workflowName: DOCUMENT_MANAGEMENT_SINGLE_FILE_PROCESSING_WORKFLOW,
        executionId: file.id,
        taskQueue: DOCUMENT_MANAGEMENT_TASK_QUEUE,
        projectId: file.projectId,
        projectVersion: file.projectVersion,
        idReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
        idConflictPolicy: "USE_EXISTING",
        workflowInput: {
          fileId: file.id,
          projectVersion: file.projectVersion,
          bucketPath: file.bucketPath,
          filename: file.filename,
          fileType: type,
          projectId: file.projectId,
          workflowActor: workflowActor(),
        },
      },
    } satisfies DocumentManagementFileProcessingTemporalInput;
    try {
      const result = await this.commands.startFileProcessing(temporalInput);
      return {
        workflowId: result.workflowId,
        runId: result.runId,
        workflowStatus: result.workflowStatus,
      };
    } catch (error) {
      await this.updateFileWorkflowStatus(file, originalStatus);
      throw dmsErrors.TEMPORAL_FAILED({ cause: error instanceof Error ? error : undefined });
    }
  }

  async getDiff(zipId: string, projectVersion?: number): Promise<FileDiff> {
    const zip = await this.requireZip(zipId, projectVersion);
    return rowsToDiff(await this.diffRows(zip.id, zip.projectVersion));
  }

  async getInternalDiff(projectId: string, zipId: string, sourceVersion: number) {
    const zip = await this.findZip(zipId, sourceVersion);
    if (!zip || zip.projectId !== projectId) throw notFound({ message: "ZIP file not found" });
    return rowsToDiff(await this.diffRows(zip.id, sourceVersion));
  }

  async updateZipApprovalStatus(
    projectId: string,
    zipId: string,
    status: Exclude<ZipRow["approvalStatus"], null>,
    error: string | null,
  ) {
    return this.scope.transact(async () => {
      const zip = await this.lockZip(zipId);
      if (zip.projectId !== projectId) throw notFound({ message: "ZIP file not found" });
      if (
        zip.approvalStatus !== status &&
        !(
          (status === "APPROVING" &&
            (zip.approvalStatus === "REQUIRES_APPROVAL" ||
              (zip.approvalStatus === null && zip.workflowStatus === "RUNNING"))) ||
          ((status === "APPROVED" || status === "FAILED_APPROVE") &&
            zip.approvalStatus === "APPROVING") ||
          (status === "REJECTED" && zip.approvalStatus === "REQUIRES_APPROVAL") ||
          (status === "REQUIRES_APPROVAL" && zip.approvalStatus === null)
        )
      ) {
        throw conflict({ message: "ZIP approval no longer belongs to the admitted decision" });
      }
      await this.scope.query((database) =>
        database
          .update(zipFiles)
          .set({ approvalStatus: status, approvalError: error })
          .where(and(eq(zipFiles.id, zipId), eq(zipFiles.projectVersion, zip.projectVersion))),
      );
      return { approvalStatus: status, error };
    });
  }

  private validateDiffEntry(row: DiffRow, decision: DiffDecision): void {
    const { kind, entry } = decision;
    if (kind === "new" || kind === "excluded") {
      if (kind === "excluded" && row.computedKind !== "new")
        throw DmsValidationError({ message: "Only computed new files can be excluded" });
      same("filename", row.computedKind === "renamed" ? row.newName : row.filename, entry.filename);
      same("bucket_path", row.bucketPath, entry.bucketPath);
      same("sha", row.sha, entry.sha);
      return;
    }
    same("file_id", row.fileId, entry.fileId);
    if (kind === "changed") {
      same("filename", row.filename, entry.filename);
      same("bucket_path", row.bucketPath, entry.bucketPath);
      same("source_sha", row.sourceSha, entry.sourceSha);
      same("target_sha", row.targetSha, entry.targetSha);
      return;
    }
    if (kind === "deleted") {
      same("filename", row.filename, entry.filename);
      same("sha", row.sha, entry.sha);
      return;
    }
    if (kind === "renamed") {
      same("old_name", row.oldName, entry.oldName);
      same("new_name", row.newName, entry.newName);
      same("sha", row.sha, entry.sha);
      return;
    }
    same("filename", row.computedKind === "renamed" ? row.oldName : row.filename, entry.filename);
    same("sha", row.computedKind === "changed" ? row.targetSha : row.sha, entry.sha);
  }

  async setDiff(zipId: string, diff: FileDiff): Promise<FileDiff> {
    return this.scope.transact(async () => {
      const zip = await this.lockZip(zipId);
      if (zip.approvalStatus !== "REQUIRES_APPROVAL") {
        throw conflict({ message: "ZIP approval is already locked for version creation" });
      }
      const rows = await this.diffRows(zip.id, zip.projectVersion);
      const byKey = new Map(rows.map((row) => [row.entryKey, row]));
      const renamedByNewName = new Map(
        rows.flatMap((row) =>
          row.computedKind === "renamed" && row.newName ? [[row.newName, row]] : [],
        ),
      );
      const submitted: DiffDecision[] = [
        ...diff.new.map((entry) => ({ kind: "new", entry }) satisfies DiffDecision),
        ...(diff.excluded ?? []).map((entry) => ({ kind: "excluded", entry }) satisfies DiffDecision),
        ...diff.deleted.map((entry) => ({ kind: "deleted", entry }) satisfies DiffDecision),
        ...diff.changed.map((entry) => ({ kind: "changed", entry }) satisfies DiffDecision),
        ...diff.renamed.map((entry) => ({ kind: "renamed", entry }) satisfies DiffDecision),
        ...diff.unchanged.map((entry) => ({ kind: "unchanged", entry }) satisfies DiffDecision),
      ];
      const decisions = new Map<
        string,
        { readonly kind: DiffRow["decisionKind"]; readonly row: DiffRow }
      >();
      for (const decision of submitted) {
        const candidateKey =
          decision.kind === "new" || decision.kind === "excluded"
            ? decision.entry.filename
            : decision.entry.fileId;
        const row =
          byKey.get(candidateKey) ??
          (decision.kind === "new" ? renamedByNewName.get(decision.entry.filename) : undefined);
        if (!row) throw DmsValidationError({ message: "Submitted diff contains an unknown entry" });
        this.validateDiffEntry(row, decision);
        const existing = decisions.get(row.entryKey);
        if (existing) {
          if (
            row.computedKind === "renamed" &&
            ((existing.kind === "new" && decision.kind === "unchanged") ||
              (existing.kind === "unchanged" && decision.kind === "new"))
          ) {
            if (decision.kind === "new") {
              decisions.set(row.entryKey, { kind: "new", row });
            }
            continue;
          }
          throw DmsValidationError({ message: "Submitted diff contains duplicate decisions" });
        }
        decisions.set(row.entryKey, { kind: decision.kind, row });
      }
      for (const row of rows) {
        if (row.computedKind === "new" && !decisions.has(row.entryKey))
          decisions.set(row.entryKey, { kind: "excluded", row });
      }
      if (decisions.size !== rows.length) {
        throw DmsValidationError({ message: "Submitted diff must decide every computed entry" });
      }
      await this.scope.query(async (database) => {
        for (const { kind, row } of decisions.values()) {
          const filename =
            row.computedKind === "renamed"
              ? kind === "unchanged"
                ? row.oldName
                : kind === "new" || kind === "renamed"
                  ? row.newName
                  : row.filename
              : row.filename;
          await database
            .update(zipFileDiffEntries)
            .set({ decisionKind: kind, filename: filename ?? row.filename })
            .where(eq(zipFileDiffEntries.id, row.id));
        }
      });
      await this.auditZipAction(zip.projectId!, zip.id, "set_file_diff");
      return this.getDiff(zip.id, zip.projectVersion);
    });
  }

  async submitDecision(
    zipId: string,
    decision: "approve" | "reject",
  ): Promise<ApprovalActionResponse> {
    const zip = await this.scope.transact(async () => {
      const zip = await this.lockZip(zipId);
      if (!zip.projectId)
        throw DmsValidationError({ message: `ZIP '${zip.id}' is missing project_id` });
      if (decision === "reject") {
        if (zip.approvalStatus !== "REQUIRES_APPROVAL" && zip.approvalStatus !== "REJECTED") {
          throw conflict({ message: "An admitted ZIP approval cannot be rejected" });
        }
      } else if (
        zip.approvalStatus !== "REQUIRES_APPROVAL" &&
        zip.approvalStatus !== "APPROVING" &&
        zip.approvalStatus !== "APPROVED"
      ) {
        throw conflict({ message: `ZIP file is not awaiting approval: ${zip.approvalStatus}` });
      }
      if (zip.approvalStatus !== "APPROVED") {
        await this.scope.query((database) =>
          database
            .update(zipFiles)
            .set({ approvalStatus: decision === "reject" ? "REJECTED" : "APPROVING" })
            .where(and(eq(zipFiles.id, zip.id), eq(zipFiles.projectVersion, zip.projectVersion))),
        );
      }
      return { ...zip, projectId: zip.projectId };
    });
    if (decision === "reject") {
      await this.auditZipAction(zip.projectId, zip.id, "submit_approval_reject");
      return {
        status: "success",
        message: `ZIP approval rejected for file ${zip.id}`,
        currentApprovalStatus: "REJECTED",
        zipApprovalStatus: "REJECTED",
      };
    }
    if (zip.approvalStatus === "APPROVED") {
      return {
        status: "already_processed",
        message: `ZIP approval already completed for file ${zip.id}`,
        currentApprovalStatus: "APPROVED",
        zipApprovalStatus: "APPROVED",
      };
    }
    const temporalInput = {
      workflowName: PROJECT_VERSIONING_CREATE_WORKFLOW,
      executionId: `CreateProjectVersionWorkflow-${zip.id}`,
      taskQueue: PROJECT_VERSIONING_TASK_QUEUE,
      projectId: zip.projectId,
      zipFileId: zip.id,
      sourceProjectVersion: zip.sourceProjectVersion,
      idReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
      idConflictPolicy: "USE_EXISTING",
    } satisfies DocumentManagementProjectVersionApprovalTemporalInput;
    let result: { newVersion: number | null };
    try {
      result = await this.commands.executeProjectVersionApproval(temporalInput);
    } catch (error) {
      if (
        error instanceof TemporalFixtureMatchError ||
        error instanceof TemporalFixtureValidationError
      ) {
        throw error;
      }
      throw dmsErrors.TEMPORAL_FAILED({ cause: error instanceof Error ? error : undefined });
    }
    const current = await this.findZip(zip.id);
    if (result.newVersion === null) {
      return {
        status: "failed",
        message: `ZIP approval failed for file ${zip.id}: workflow completed without a new version`,
        currentApprovalStatus: "REJECTED",
        zipApprovalStatus: current?.approvalStatus ?? "FAILED_APPROVE",
      };
    }
    await this.auditZipAction(zip.projectId, zip.id, "submit_approval_approve");
    return {
      status: "success",
      message: `ZIP approval completed for file ${zip.id}`,
      currentApprovalStatus: "APPROVED",
      zipApprovalStatus: current?.approvalStatus,
      newVersion: result.newVersion,
    };
  }

  async cancelProcessing(zipId: string) {
    const zip = await this.requireZip(zipId);
    if (!zip.projectId) throw new Error(`ZIP '${zip.id}' is missing project_id`);
    if (zip.workflowId === null || zip.runId === null)
      throw conflict({
        message:
          "ZIP execution association is unresolved; retry processing admission before cancelling",
      });
    try {
      await this.commands.cancelFileProcessing({ workflowId: zip.workflowId, runId: zip.runId });
    } catch (error) {
      throw dmsErrors.TEMPORAL_FAILED({ cause: error instanceof Error ? error : undefined });
    }
    await this.auditZipAction(zip.projectId, zip.id, "cancel_upload_process");
    return { fileId: zip.id, success: true };
  }

  private cloneFile(source: FileRow, targetVersion: number, overrides: Partial<FileRow> = {}) {
    return {
      id: source.id,
      projectId: source.projectId,
      projectVersion: targetVersion,
      isDeleted: false,
      isOutdated: false,
      frontendParentIds: source.frontendParentIds,
      updateType: source.updateType,
      type: source.type,
      filename: source.filename,
      mimeType: source.mimeType,
      version: source.version,
      bucketPath: source.bucketPath,
      addedInVersion: source.addedInVersion,
      workflowId: source.workflowId,
      runId: source.runId,
      vectorSearchable: source.vectorSearchable,
      sourceZipFileId: null,
      workflowStatus: source.workflowStatus,
      ...overrides,
    } satisfies typeof files.$inferInsert;
  }

  private async sourceFiles(projectId: string, sourceVersion: number, ids: readonly string[]) {
    if (ids.length === 0) return [];
    return this.scope.query((database) =>
      database
        .select()
        .from(files)
        .where(
          and(
            eq(files.projectId, projectId),
            eq(files.projectVersion, sourceVersion),
            eq(files.isDeleted, false),
            inArray(files.id, [...ids]),
          ),
        ),
    );
  }

  private async cloneTopics(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    fileIds: readonly string[],
  ) {
    if (fileIds.length === 0 || sourceVersion === targetVersion) return;
    await this.scope.query(async (database) => {
      const sourceRows = await database
        .select()
        .from(fileTopics)
        .where(
          and(
            eq(fileTopics.projectId, projectId),
            eq(fileTopics.projectVersion, sourceVersion),
            eq(fileTopics.isDeleted, false),
            inArray(fileTopics.fileId, [...fileIds]),
          ),
        );
      if (sourceRows.length === 0) return;
      const existingRows = await database
        .select({ id: fileTopics.id })
        .from(fileTopics)
        .where(
          and(
            eq(fileTopics.projectId, projectId),
            eq(fileTopics.projectVersion, targetVersion),
            inArray(
              fileTopics.id,
              sourceRows.map(({ id }) => id),
            ),
          ),
        );
      const existingIds = new Set(existingRows.map(({ id }) => id));
      const rows = sourceRows.filter(({ id }) => !existingIds.has(id));
      if (rows.length === 0) return;
      await database.insert(fileTopics).values(
        rows.map((row) => ({
          id: row.id,
          projectId: row.projectId,
          projectVersion: targetVersion,
          isDeleted: false,
          isOutdated: row.isOutdated,
          frontendParentIds: row.frontendParentIds,
          updateType: row.updateType,
          fileId: row.fileId,
          topicId: row.topicId,
          subtopicId: row.subtopicId,
        })),
      );
    });
  }

  private async carryForwardRows(
    projectId: string,
    sourceVersion: number,
    diff: FileDiff,
  ): Promise<Array<{ readonly row: FileRow; readonly filename?: string }>> {
    const renamedProcessedNames = new Map(
      diff.renamed.map(({ oldName, newName }) => [
        processedJsonFilename(oldName),
        processedJsonFilename(newName),
      ]),
    );
    const processedNames = [
      "summary.json",
      ...diff.unchanged.map(({ filename }) => processedJsonFilename(filename)),
      ...renamedProcessedNames.keys(),
    ];
    const rows = await this.scope.query((database) =>
      database
        .select()
        .from(files)
        .where(
          and(
            eq(files.projectId, projectId),
            eq(files.projectVersion, sourceVersion),
            eq(files.isDeleted, false),
            or(
              eq(files.type, "EWMS_DOCUMENT"),
              and(eq(files.type, "CONTENT_EXTRACTION"), inArray(files.filename, processedNames)),
            ),
          ),
        ),
    );
    return rows.map((row) => {
      const filename = renamedProcessedNames.get(row.filename);
      return filename === undefined ? { row } : { row, filename };
    });
  }

  private async commitDiffInPlace(
    zip: ZipRow,
    projectId: string,
    projectVersion: number,
    lockToken: string,
    diff: FileDiff,
  ): Promise<void> {
    const rows = await this.scope.query((database) =>
      database
        .select()
        .from(files)
        .where(and(eq(files.projectId, projectId), eq(files.projectVersion, projectVersion))),
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const projectedById = new Map(rows.map((row) => [row.id, { ...row }]));
    const updates = new Map<string, Partial<typeof files.$inferInsert>>();
    const inserts: Array<typeof files.$inferInsert> = [];
    const newDocuments: Array<{ readonly id: string; readonly filename: string }> = [];
    const rowById = (id: string): FileRow => {
      const row = byId.get(id);
      if (!row)
        throw notFound({ message: `File ${id} at projectVersion ${projectVersion} not found` });
      return row;
    };
    const mergeUpdate = (id: string, values: Partial<typeof files.$inferInsert>): void => {
      const projected = projectedById.get(id);
      if (!projected)
        throw notFound({ message: `File ${id} at projectVersion ${projectVersion} not found` });
      const changed = Object.fromEntries(
        Object.entries(values).filter(
          ([field, value]) => !Object.is(projected[field as keyof FileRow], value),
        ),
      ) as Partial<typeof files.$inferInsert>;
      if (Object.keys(changed).length === 0) return;
      updates.set(id, { ...updates.get(id), ...changed });
      projectedById.set(id, { ...projected, ...changed });
    };

    const nextDocumentVersion = (filename: string): number =>
      Math.max(
        0,
        ...rows
          .filter((row) => row.type === "DOCUMENT" && row.filename === filename)
          .map(({ version }) => version),
      ) + 1;

    for (const entry of diff.deleted) mergeUpdate(rowById(entry.fileId).id, { isDeleted: true });

    for (const entry of diff.renamed) {
      mergeUpdate(rowById(entry.fileId).id, { filename: entry.newName });
      const oldProcessedName = processedJsonFilename(entry.oldName);
      const processed = rows.find(
        (row) =>
          row.type === "CONTENT_EXTRACTION" && !row.isDeleted && row.filename === oldProcessedName,
      );
      if (processed) {
        mergeUpdate(processed.id, { filename: processedJsonFilename(entry.newName) });
      }
    }

    for (const entry of diff.changed) {
      const source = rowById(entry.fileId);
      if (
        source.sourceZipFileId === zip.id &&
        source.filename === entry.filename &&
        !source.isDeleted
      ) {
        continue;
      }
      const nextVersion = nextDocumentVersion(entry.filename);
      const targetPath = buildObjectPath(entry.filename, {
        type: "document",
        version: nextVersion,
        projectId,
        revisionId: zip.id,
      });
      await this.cleanStorage.copy(entry.bucketPath, targetPath, {
        expectedSha256: entry.sourceSha,
      });
      mergeUpdate(source.id, {
        filename: entry.filename,
        bucketPath: targetPath,
        mimeType: await this.cleanStorage.contentType(entry.bucketPath),
        version: nextVersion,
        sourceZipFileId: zip.id,
        isDeleted: false,
        isOutdated: false,
      });
    }

    for (const entry of diff.new) {
      const reserved = rows
        .filter(
          (row) =>
            row.type === "DOCUMENT" &&
            row.filename === entry.filename &&
            row.sourceZipFileId === zip.id,
        )
        .sort((left, right) => right.version - left.version)[0];
      const mimeType = await this.cleanStorage.contentType(entry.bucketPath);
      if (reserved) {
        await this.cleanStorage.copy(entry.bucketPath, reserved.bucketPath, {
          expectedSha256: entry.sha,
        });
        mergeUpdate(reserved.id, { mimeType, isDeleted: false, isOutdated: false });
        newDocuments.push({ id: reserved.id, filename: entry.filename });
        continue;
      }
      const version = nextDocumentVersion(entry.filename);
      const bucketPath = buildObjectPath(entry.filename, {
        type: "document",
        version,
        projectId,
        revisionId: zip.id,
      });
      await this.cleanStorage.copy(entry.bucketPath, bucketPath, { expectedSha256: entry.sha });
      const id = crypto.randomUUID();
      inserts.push({
        id,
        projectId,
        projectVersion,
        isDeleted: false,
        isOutdated: false,
        frontendParentIds: [],
        updateType: "AUTOMATED",
        type: "DOCUMENT",
        filename: entry.filename,
        mimeType,
        version,
        bucketPath,
        addedInVersion: projectVersion,
        workflowId: null,
        runId: null,
        vectorSearchable: null,
        sourceZipFileId: zip.id,
        workflowStatus: null,
      });
      newDocuments.push({ id, filename: entry.filename });
    }

    await this.scope.transact(async () => {
      await this.requireVersionLock(projectId, projectVersion, projectVersion, lockToken, zip.id);
      await this.scope.query(async (database) => {
        for (const { id, filename } of newDocuments) {
          await database
            .update(files)
            .set({ isDeleted: true })
            .where(
              and(
                eq(files.projectId, projectId),
                eq(files.projectVersion, projectVersion),
                eq(files.type, "DOCUMENT"),
                eq(files.filename, filename),
                eq(files.isDeleted, false),
                ne(files.id, id),
              ),
            );
        }
        for (const [id, values] of updates) {
          await database
            .update(files)
            .set(values)
            .where(and(eq(files.id, id), eq(files.projectVersion, projectVersion)));
        }
        if (inserts.length > 0) await database.insert(files).values(inserts);
      });
    });
  }

  async commitDiff(
    projectId: string,
    zipId: string,
    input: {
      readonly sourceVersion: number;
      readonly targetVersion: number;
      readonly lockToken: string;
      readonly dryRun: boolean;
    },
  ) {
    const zip = await this.findZip(zipId, input.sourceVersion);
    if (!zip)
      throw notFound({
        message: `Zip file '${zipId}' at projectVersion ${input.sourceVersion} not found.`,
      });
    if (zip.projectId !== projectId)
      throw DmsValidationError({ message: "ZIP projectId does not match request projectId" });
    if (zip.sourceProjectVersion !== input.sourceVersion) {
      throw DmsValidationError({
        message: "ZIP diff source version does not match request sourceVersion",
      });
    }
    const diff = rowsToDiff(await this.diffRows(zip.id, input.sourceVersion));
    const counts = {
      dryRun: input.dryRun,
      new: diff.new.length,
      changed: diff.changed.length,
      renamed: diff.renamed.length,
      unchanged: diff.unchanged.length,
    };
    await this.requireVersionLock(
      projectId,
      input.sourceVersion,
      input.targetVersion,
      input.lockToken,
      zip.id,
    );
    if (input.dryRun) return counts;
    if (input.sourceVersion === input.targetVersion) {
      await this.commitDiffInPlace(zip, projectId, input.sourceVersion, input.lockToken, diff);
      return counts;
    }

    const carryForward = await this.carryForwardRows(projectId, input.sourceVersion, diff);
    const expectedIds = new Set([
      ...diff.unchanged.map(({ fileId }) => fileId),
      ...diff.changed.map(({ fileId }) => fileId),
      ...diff.renamed.map(({ fileId }) => fileId),
      ...carryForward.map(({ row }) => row.id),
    ]);
    const expectedNewNames = new Set(diff.new.map(({ filename }) => filename));
    const expected = expectedIds.size + expectedNewNames.size;
    const targetRows = await this.scope.query((database) =>
      database
        .select()
        .from(files)
        .where(
          and(
            eq(files.projectId, projectId),
            eq(files.projectVersion, input.targetVersion),
            eq(files.isDeleted, false),
          ),
        ),
    );
    const existingKeys = new Set<string>();
    for (const row of targetRows) {
      if (expectedIds.has(row.id)) existingKeys.add(`id:${row.id}`);
      if (expectedNewNames.has(row.filename)) existingKeys.add(`new:${row.filename}`);
    }
    if (existingKeys.size === expected && expected > 0) {
      await this.scope.transact(async () => {
        await this.requireVersionLock(
          projectId,
          input.sourceVersion,
          input.targetVersion,
          input.lockToken,
          zip.id,
        );
        await this.cloneTopics(projectId, input.sourceVersion, input.targetVersion, [
          ...expectedIds,
        ]);
      });
      return counts;
    }
    if (existingKeys.size > 0) {
      throw conflict({
        message: `${existingKeys.size} target rows already exist for project ${projectId} at projectVersion ${input.targetVersion}`,
      });
    }

    const sourceIds = [...expectedIds];
    const sourceRows = await this.sourceFiles(projectId, input.sourceVersion, sourceIds);
    if (sourceRows.length !== sourceIds.length) {
      throw notFound({ message: "ZIP diff contains missing source files" });
    }
    const byId = new Map(sourceRows.map((row) => [row.id, row]));
    const targetInserts = new Map<string, typeof files.$inferInsert>();
    const addTarget = (row: typeof files.$inferInsert): void => {
      targetInserts.set(row.id, row);
    };
    for (const { row, filename } of carryForward) {
      addTarget(
        this.cloneFile(row, input.targetVersion, filename === undefined ? {} : { filename }),
      );
    }
    for (const entry of diff.unchanged) {
      addTarget(this.cloneFile(byId.get(entry.fileId)!, input.targetVersion));
    }
    for (const entry of diff.renamed) {
      addTarget(
        this.cloneFile(byId.get(entry.fileId)!, input.targetVersion, {
          filename: entry.newName,
        }),
      );
    }
    for (const entry of diff.changed) {
      const source = byId.get(entry.fileId)!;
      const nextVersion = source.version + 1;
      const targetPath = buildObjectPath(entry.filename, {
        type: apiFileType(source.type),
        version: nextVersion,
        projectId,
        revisionId: zip.id,
      });
      await this.cleanStorage.copy(entry.bucketPath, targetPath, {
        expectedSha256: entry.sourceSha,
      });
      addTarget(
        this.cloneFile(source, input.targetVersion, {
          filename: entry.filename,
          bucketPath: targetPath,
          mimeType: await this.cleanStorage.contentType(entry.bucketPath),
          version: nextVersion,
          sourceZipFileId: null,
        }),
      );
    }
    for (const entry of diff.new) {
      const targetPath = buildObjectPath(entry.filename, {
        type: "document",
        version: 1,
        projectId,
        revisionId: zip.id,
      });
      await this.cleanStorage.copy(entry.bucketPath, targetPath, { expectedSha256: entry.sha });
      const id = crypto.randomUUID();
      addTarget({
        id,
        projectId,
        projectVersion: input.targetVersion,
        isDeleted: false,
        isOutdated: false,
        frontendParentIds: [],
        updateType: "AUTOMATED",
        type: databaseFileType("document"),
        filename: entry.filename,
        mimeType: await this.cleanStorage.contentType(entry.bucketPath),
        version: 1,
        bucketPath: targetPath,
        addedInVersion: input.targetVersion,
        workflowId: null,
        runId: null,
        vectorSearchable: null,
        sourceZipFileId: null,
        workflowStatus: null,
      });
    }
    await this.scope.transact(async () => {
      await this.requireVersionLock(
        projectId,
        input.sourceVersion,
        input.targetVersion,
        input.lockToken,
        zip.id,
      );
      if (targetInserts.size > 0) {
        await this.scope.query((database) =>
          database.insert(files).values([...targetInserts.values()]),
        );
      }
      await this.cloneTopics(projectId, input.sourceVersion, input.targetVersion, sourceIds);
    });
    return counts;
  }

  private async requireVersionLock(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    lockToken: string,
    zipFileId: string,
  ): Promise<void> {
    const request = {
      projectId,
      sourceVersion,
      targetVersion,
      lockToken,
      zipFileId,
    };
    const validation = await this.projectVersions.validateVersionLock(request);
    if (validation.isErr()) throw validation.error;
  }
}
