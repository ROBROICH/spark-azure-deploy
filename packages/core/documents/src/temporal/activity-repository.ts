import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { activityInfo } from "@temporalio/activity";
import { and, desc, eq, isNull, max, or } from "drizzle-orm";

import { files, zipFileDiffEntries, zipFiles } from "../db/schema.ts";
import type { DmsScope } from "../db.ts";
import { conflict } from "../errors.ts";
import { databaseFileType, validateFilename } from "../files/file-types.ts";
import { buildObjectPath } from "../files/object-path.ts";
import { StorageConflictError, type S3Storage } from "../storage/s3-storage.ts";
import type {
  IngestFileInput,
  PersistZipDiffInput,
  RenameFileInput,
  UpdateFileStatusInput,
  UpdateZipApprovalStatusInput,
  UpdateZipStatusInput,
} from "./contracts.ts";
import type { DiffFileRow } from "./diff.ts";

export class DmsActivityNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DmsActivityNotFoundError";
  }
}

export interface DmsActivityRepository {
  listFiles(input: {
    readonly projectId: string;
    readonly projectVersion: number;
    readonly fileType: "document" | "ewms_document";
  }): Promise<readonly DiffFileRow[]>;
  ingestFile(input: IngestFileInput): Promise<string>;
  renameFile(input: RenameFileInput): Promise<boolean>;
  persistZipDiff(input: PersistZipDiffInput): Promise<void>;
  updateZipStatus(input: UpdateZipStatusInput): Promise<void>;
  updateFileStatus(input: UpdateFileStatusInput): Promise<void>;
  updateZipApprovalStatus(input: UpdateZipApprovalStatusInput): Promise<void>;
}

export class DrizzleDmsActivityRepository implements DmsActivityRepository {
  constructor(
    private readonly scope: DmsScope,
    private readonly storage: S3Storage,
  ) {}

  listFiles(input: {
    readonly projectId: string;
    readonly projectVersion: number;
    readonly fileType: "document" | "ewms_document";
  }): Promise<readonly DiffFileRow[]> {
    return this.scope.query((database) =>
      database
        .select({ id: files.id, filename: files.filename, bucketPath: files.bucketPath })
        .from(files)
        .where(
          and(
            eq(files.projectId, input.projectId),
            eq(files.projectVersion, input.projectVersion),
            eq(files.type, databaseFileType(input.fileType)),
            eq(files.isDeleted, false),
          ),
        ),
    );
  }

  async ingestFile(input: IngestFileInput): Promise<string> {
    validateFilename(input.filename);
    const metadata = await this.storage.head(input.bucketPath);
    const mimeType = metadata.contentType ?? "application/pdf";
    const expectedSha256 = metadata.metadata.sha256;
    if (!expectedSha256)
      throw StorageConflictError({ message: "ZIP entry has no trusted content digest" });
    if (input.fileId !== null) {
      const fileId = input.fileId;
      const [existing] = await this.scope.query((database) =>
        database
          .select()
          .from(files)
          .where(and(eq(files.id, fileId), eq(files.projectVersion, input.projectVersion)))
          .limit(1),
      );
      if (!existing) {
        throw new DmsActivityNotFoundError(
          `File '${input.fileId}' not found at project version ${input.projectVersion}`,
        );
      }
      const version =
        existing.sourceZipFileId === input.zipFileId ? existing.version : existing.version + 1;
      const destination = buildObjectPath(input.filename, {
        type: input.entryFileType,
        projectId: input.projectId,
        version,
        revisionId: input.zipFileId,
      });
      await this.storage.copy(input.bucketPath, destination, { expectedSha256 });
      await this.scope.transact(() =>
        this.scope.query(async (transaction) => {
          const updated = await transaction
            .update(files)
            .set({
              filename: input.filename,
              bucketPath: destination,
              mimeType,
              version,
              sourceZipFileId: input.zipFileId,
              isDeleted: false,
              isOutdated: false,
            })
            .where(and(eq(files.id, fileId), eq(files.projectVersion, input.projectVersion)))
            .returning({ id: files.id });
          if (updated.length !== 1) {
            throw new DmsActivityNotFoundError(`File '${input.fileId}' disappeared during ingest`);
          }
          await recordAuditEntry(transaction, {
            projectId: input.projectId,
            entityId: fileId,
            entityType: "file",
            changeType: "update",
          });
        }),
      );
      return fileId;
    }

    const [reserved] = await this.scope.query((database) =>
      database
        .select({ id: files.id, bucketPath: files.bucketPath })
        .from(files)
        .where(
          and(
            eq(files.projectId, input.projectId),
            eq(files.projectVersion, input.projectVersion),
            eq(files.filename, input.filename),
            eq(files.type, databaseFileType(input.entryFileType)),
            eq(files.sourceZipFileId, input.zipFileId),
          ),
        )
        .limit(1),
    );
    if (reserved) {
      await this.storage.copy(input.bucketPath, reserved.bucketPath, { expectedSha256 });
      return reserved.id;
    }

    const [latest] = await this.scope.query((database) =>
      database
        .select({ version: max(files.version) })
        .from(files)
        .where(
          and(
            eq(files.projectId, input.projectId),
            eq(files.projectVersion, input.projectVersion),
            eq(files.filename, input.filename),
            eq(files.type, databaseFileType(input.entryFileType)),
          ),
        ),
    );
    const version = (latest?.version ?? 0) + 1;
    const destination = buildObjectPath(input.filename, {
      type: input.entryFileType,
      projectId: input.projectId,
      version,
      revisionId: input.zipFileId,
    });
    await this.storage.copy(input.bucketPath, destination, { expectedSha256 });
    const id = crypto.randomUUID();
    await this.scope.transact(() =>
      this.scope.query(async (transaction) => {
        await transaction.insert(files).values({
          id,
          projectId: input.projectId,
          projectVersion: input.projectVersion,
          type: databaseFileType(input.entryFileType),
          filename: input.filename,
          mimeType,
          version,
          bucketPath: destination,
          addedInVersion: input.projectVersion,
          sourceZipFileId: input.zipFileId,
          workflowStatus: null,
          isDeleted: false,
          isOutdated: false,
          frontendParentIds: [],
          updateType: "AUTOMATED",
        });
        await recordAuditEntry(transaction, {
          projectId: input.projectId,
          entityId: id,
          entityType: "file",
          changeType: "create",
        });
      }),
    );
    return id;
  }

  async renameFile(input: RenameFileInput): Promise<boolean> {
    validateFilename(input.newName);
    return this.scope.transact(() =>
      this.scope.query(async (transaction) => {
        const updated = await transaction
          .update(files)
          .set({ filename: input.newName })
          .where(
            and(
              eq(files.id, input.fileId),
              eq(files.projectId, input.projectId),
              eq(files.projectVersion, input.projectVersion),
              eq(files.isDeleted, false),
            ),
          )
          .returning({ id: files.id });
        if (updated.length === 0) return false;
        await recordAuditEntry(transaction, {
          projectId: input.projectId,
          entityId: input.fileId,
          entityType: "file",
          changeType: "update",
        });
        return true;
      }),
    );
  }

  async persistZipDiff(input: PersistZipDiffInput): Promise<void> {
    await this.scope.transact(() =>
      this.scope.query(async (transaction) => {
        const [zip] = await transaction
          .select({
            id: zipFiles.id,
            projectVersion: zipFiles.projectVersion,
            sourceProjectVersion: zipFiles.sourceProjectVersion,
          })
          .from(zipFiles)
          .where(
            and(
              eq(zipFiles.id, input.zipFileId),
              eq(zipFiles.projectVersion, input.sourceProjectVersion),
            ),
          )
          .limit(1)
          .for("update");
        if (!zip) throw new DmsActivityNotFoundError(`Zip file '${input.zipFileId}' not found`);
        if (zip.sourceProjectVersion !== null) return;
        await transaction
          .delete(zipFileDiffEntries)
          .where(
            and(
              eq(zipFileDiffEntries.zipFileId, zip.id),
              eq(zipFileDiffEntries.projectVersion, zip.projectVersion),
            ),
          );
        const rows: Array<typeof zipFileDiffEntries.$inferInsert> = [];
        for (const item of input.diff.new)
          rows.push({
            id: crypto.randomUUID(),
            zipFileId: zip.id,
            projectVersion: zip.projectVersion,
            entryKey: item.filename,
            computedKind: "new",
            decisionKind: "new",
            filename: item.filename,
            bucketPath: item.bucketPath,
            sha: item.sha,
          });
        for (const item of input.diff.deleted)
          rows.push({
            id: crypto.randomUUID(),
            zipFileId: zip.id,
            projectVersion: zip.projectVersion,
            entryKey: item.fileId,
            computedKind: "deleted",
            decisionKind: "deleted",
            fileId: item.fileId,
            filename: item.filename,
            sha: item.sha,
          });
        for (const item of input.diff.changed)
          rows.push({
            id: crypto.randomUUID(),
            zipFileId: zip.id,
            projectVersion: zip.projectVersion,
            entryKey: item.fileId,
            computedKind: "changed",
            decisionKind: "changed",
            fileId: item.fileId,
            filename: item.filename,
            bucketPath: item.bucketPath,
            sourceSha: item.sourceSha,
            targetSha: item.targetSha,
          });
        for (const item of input.diff.renamed)
          rows.push({
            id: crypto.randomUUID(),
            zipFileId: zip.id,
            projectVersion: zip.projectVersion,
            entryKey: item.fileId,
            computedKind: "renamed",
            decisionKind: "renamed",
            fileId: item.fileId,
            filename: item.newName,
            oldName: item.oldName,
            newName: item.newName,
            bucketPath: item.bucketPath ?? null,
            sha: item.sha,
          });
        for (const item of input.diff.unchanged)
          rows.push({
            id: crypto.randomUUID(),
            zipFileId: zip.id,
            projectVersion: zip.projectVersion,
            entryKey: item.fileId,
            computedKind: "unchanged",
            decisionKind: "unchanged",
            fileId: item.fileId,
            filename: item.filename,
            sha: item.sha,
          });
        if (rows.length > 0) await transaction.insert(zipFileDiffEntries).values(rows);
        await transaction
          .update(zipFiles)
          .set({
            sourceProjectVersion: input.sourceProjectVersion,
            approvalError: null,
          })
          .where(and(eq(zipFiles.id, zip.id), eq(zipFiles.projectVersion, zip.projectVersion)));
      }),
    );
  }

  async updateZipStatus(input: UpdateZipStatusInput): Promise<void> {
    const execution = activityInfo().workflowExecution;
    if (execution === undefined)
      throw conflict({ message: "ZIP status requires a workflow execution" });
    const clearFailureCode =
      input.status === "PENDING" ||
      input.status === "RUNNING" ||
      input.status === "COMPLETED" ||
      input.status === "REQUIRES_APPROVAL";
    await this.scope.transact(() =>
      this.scope.query(async (transaction) => {
        const [zip] = await transaction
          .select()
          .from(zipFiles)
          .where(eq(zipFiles.id, input.zipFileId))
          .orderBy(desc(zipFiles.projectVersion))
          .limit(1)
          .for("update");
        if (!zip) throw new DmsActivityNotFoundError(`Zip file '${input.zipFileId}' not found`);
        if (
          zip.workflowId !== null &&
          (zip.workflowId !== execution.workflowId ||
            (zip.runId !== null && zip.runId !== execution.runId))
        ) {
          throw conflict({ message: "ZIP status belongs to another processing attempt" });
        }
        const rows = await transaction
          .update(zipFiles)
          .set({
            workflowStatus: input.status,
            workflowFailureCode: clearFailureCode ? null : (input.workflowFailureCode ?? null),
            runId: zip.workflowId === null ? zip.runId : execution.runId,
          })
          .where(
            and(eq(zipFiles.id, input.zipFileId), eq(zipFiles.projectVersion, zip.projectVersion)),
          )
          .returning({ id: zipFiles.id, projectId: zipFiles.projectId });
        if (rows.length === 0) {
          throw new DmsActivityNotFoundError(`Zip file '${input.zipFileId}' not found`);
        }
        for (const row of rows) {
          if (row.projectId === null) continue;
          await recordAuditEntry(transaction, {
            projectId: row.projectId,
            entityId: row.id,
            entityType: "zip_file",
            changeType: "update",
          });
        }
      }),
    );
  }

  async updateFileStatus(input: UpdateFileStatusInput): Promise<void> {
    const rows = await this.scope.query((database) =>
      database
        .select({
          id: files.id,
          projectId: files.projectId,
          projectVersion: files.projectVersion,
        })
        .from(files)
        .where(
          and(
            eq(files.id, input.fileId),
            input.projectVersion === undefined
              ? undefined
              : eq(files.projectVersion, input.projectVersion),
          ),
        )
        .limit(2),
    );
    if (rows.length > 1) throw conflict({ message: "File processing version is unresolved" });
    const row = rows[0];
    if (!row) throw new DmsActivityNotFoundError(`File '${input.fileId}' not found`);
    await this.scope.transact(() =>
      this.scope.query(async (transaction) => {
        await transaction
          .update(files)
          .set({ workflowStatus: input.status })
          .where(and(eq(files.id, row.id), eq(files.projectVersion, row.projectVersion)));
        if (row.projectId !== null) {
          await recordAuditEntry(transaction, {
            projectId: row.projectId,
            entityId: row.id,
            entityType: "file",
            changeType: "update",
          });
        }
      }),
    );
  }

  async updateZipApprovalStatus(input: UpdateZipApprovalStatusInput): Promise<void> {
    const rows = await this.scope.query((database) =>
      database
        .update(zipFiles)
        .set({
          approvalStatus: input.status,
          approvalError: input.error ?? null,
        })
        .where(
          and(
            eq(zipFiles.id, input.zipFileId),
            input.status === "REQUIRES_APPROVAL"
              ? or(
                  isNull(zipFiles.approvalStatus),
                  eq(zipFiles.approvalStatus, "REQUIRES_APPROVAL"),
                )
              : undefined,
          ),
        )
        .returning({ id: zipFiles.id }),
    );
    if (rows.length === 0) {
      throw conflict({
        message: `Zip file '${input.zipFileId}' is not awaiting a new approval decision`,
      });
    }
  }
}
