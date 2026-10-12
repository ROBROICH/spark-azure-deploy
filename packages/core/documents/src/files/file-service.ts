import { isoInstant } from "@spark-workflow/http-host";
import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { recordRequestAudit } from "@spark-workflow/http-host";
import { defineAuditCatalog, EvlogError, log } from "evlog";
import { and, desc, eq, exists, ilike, inArray, isNull, max, or, type SQL } from "drizzle-orm";

import { searchContains } from "../../../src/search.ts";
import { dmsModels, type DmsScope } from "../db.ts";
import { fileTopics, files, zipFiles } from "../db/schema.ts";
import { conflict, DmsHttpError, DmsValidationError, notFound } from "../errors.ts";
import type { ProjectVersions } from "../../../projects/src/project-versions.ts";
import type { FileResponse, UploadRequest, ZipFileResponse } from "../schemas.ts";
import { StorageNotFoundError, type S3Storage } from "../storage/s3-storage.ts";
import {
  apiFileType,
  databaseFileType,
  internalFileTypes,
  mimeTypeForUpload,
  type FileType,
} from "./file-types.ts";
import { buildObjectPath } from "./object-path.ts";
import {
  zipWorkflowFailureCodes,
  type ZipWorkflowFailureCode,
} from "../temporal/zip-failure-codes.ts";

const fileAudit = defineAuditCatalog("document-management", {
  DOWNLOAD_URL_ISSUED: { target: "file", severity: "high" },
});

const inlineMimeTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);

type FileRow = typeof files.$inferSelect;
type FileWithTopics = FileRow & { readonly topics: readonly (typeof fileTopics.$inferSelect)[] };
type ZipFileRow = typeof zipFiles.$inferSelect;

export interface FileListInput {
  readonly type: FileType;
  readonly projectVersion: number;
  readonly projectId?: string;
  readonly accessibleIds?: readonly string[];
  readonly name?: string;
  readonly path?: string;
  readonly topicIds?: readonly string[];
  readonly includeDeleted?: boolean;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ZipListInput {
  readonly projectVersion: number;
  readonly projectId?: string;
  readonly accessibleIds?: readonly string[];
  readonly workflowStatus?: ZipFileRow["workflowStatus"];
  readonly fileType?: "zip" | "ewms_zip";
  readonly page?: number;
  readonly pageSize?: number;
}

export interface InternalFileWriteInput {
  readonly projectId: string;
  readonly type: "erwiderungs_export";
  readonly filename: string;
  readonly content: Uint8Array;
}

export const fileResponse = (row: FileRow, topics: string[] = []): FileResponse => ({
  id: row.id,
  type: apiFileType(row.type),
  filename: row.filename,
  mimeType: row.mimeType,
  bucketPath: row.bucketPath,
  version: row.version,
  projectVersion: row.projectVersion,
  addedInVersion: row.addedInVersion,
  isDeleted: row.isDeleted,
  projectId: row.projectId,
  workflowId: row.workflowId,
  runId: row.runId,
  vectorSearchable: row.vectorSearchable,
  topics,
  createdAt: isoInstant(row.createdAt),
  updatedAt: isoInstant(row.updatedAt),
});

const fileWithTopicsResponse = (row: FileWithTopics): FileResponse => {
  const topics: string[] = [];
  for (const topic of row.topics) {
    if (topic.topicId !== null && !topics.includes(topic.topicId)) topics.push(topic.topicId);
  }
  return fileResponse(row, topics);
};

const zipWorkflowFailureCode = (code: string | null): ZipWorkflowFailureCode | null => {
  if (code === null) return null;
  const failureCode = zipWorkflowFailureCodes.find((candidate) => candidate === code);
  if (failureCode === undefined) {
    throw new Error(`ZIP workflow failure code '${code}' is not supported`);
  }
  return failureCode;
};

export const zipFileResponse = (row: ZipFileRow): ZipFileResponse => {
  if (row.projectId === null) throw new Error(`ZIP '${row.id}' is missing project_id`);
  return {
    id: row.id,
    filename: row.filename,
    type: apiFileType(row.type),
    bucketPath: row.bucketPath,
    projectId: row.projectId,
    workflowStatus: row.workflowStatus,
    approvalStatus: row.approvalStatus,
    approvalError: row.approvalError,
    workflowFailureCode: zipWorkflowFailureCode(row.workflowFailureCode),
    sourceProjectVersion: row.sourceProjectVersion,
    createdAt: isoInstant(row.createdAt),
    updatedAt: isoInstant(row.updatedAt),
  };
};

export const publicConfirmResponse = (row: FileRow | ZipFileRow): ZipFileResponse => {
  if (!("mimeType" in row)) return zipFileResponse(row);
  if (row.projectId === null) throw new Error(`Public file '${row.id}' is missing project_id`);
  return {
    id: row.id,
    filename: row.filename,
    type: apiFileType(row.type),
    bucketPath: row.bucketPath,
    projectId: row.projectId,
    workflowStatus: row.workflowStatus ?? "PENDING",
    approvalStatus: null,
    approvalError: null,
    workflowFailureCode: null,
    sourceProjectVersion: null,
    createdAt: isoInstant(row.createdAt),
    updatedAt: isoInstant(row.updatedAt),
  };
};

export class FileService {
  constructor(
    private readonly scope: DmsScope,
    private readonly projectVersions: Pick<ProjectVersions, "ensureWritable" | "latestOne">,
    readonly cleanStorage: S3Storage,
    readonly quarantineStorage: S3Storage,
    readonly scanningEnabled: boolean,
    readonly maxObjectBytes: number,
  ) {}

  private storageFor(type: FileType): S3Storage {
    if (!this.scanningEnabled || internalFileTypes.has(type)) return this.cleanStorage;
    return this.quarantineStorage;
  }

  async getFileRow(
    fileId: string,
    projectVersion?: number,
    includeDeleted = false,
  ): Promise<FileRow | undefined> {
    return this.scope.query(
      async (database) =>
        (await dmsModels(database).files.findFirst({
          where: { id: fileId, projectVersion, isDeleted: includeDeleted ? undefined : false },
          orderBy: [{ projectVersion: "desc" }, { version: "desc" }],
        })) ?? undefined,
    );
  }

  async getFile(fileId: string, projectVersion: number): Promise<FileResponse> {
    const row = await this.scope.query((database) =>
      dmsModels(database).files.findFirst({
        where: { id: fileId, projectVersion, isDeleted: false },
        include: { topics: { where: { isDeleted: false } } },
      }),
    );
    if (!row) throw notFound({ message: "File not found" });
    return fileWithTopicsResponse(row);
  }

  async getVersions(fileId: string): Promise<FileResponse[]> {
    const current = await this.getFileRow(fileId, undefined, true);
    if (!current) throw notFound({ message: "File not found" });
    const rows = await this.scope.query((database) =>
      dmsModels(database).files.findMany({
        where: {
          filename: current.filename,
          type: current.type,
          projectId: current.projectId,
        },
        include: { topics: { where: { isDeleted: false } } },
        orderBy: [{ projectVersion: "desc" }, { version: "desc" }],
      }),
    );
    return rows.map(fileWithTopicsResponse);
  }

  async listFiles(input: FileListInput): Promise<FileResponse[]> {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;
    const topicIds = input.topicIds?.length ? [...input.topicIds] : undefined;
    const rows = await this.scope.query((database) =>
      dmsModels(database).files.findMany({
        where: and(
          eq(files.type, databaseFileType(input.type)),
          eq(files.projectVersion, input.projectVersion),
          input.includeDeleted ? undefined : eq(files.isDeleted, false),
          input.projectId === undefined ? undefined : eq(files.projectId, input.projectId),
          input.accessibleIds === undefined
            ? undefined
            : inArray(files.projectId, [...input.accessibleIds]),
          searchContains(files.filename, input.name),
          input.path === undefined ? undefined : ilike(files.bucketPath, `%${input.path}%`),
          topicIds === undefined
            ? undefined
            : exists(
                database
                  .select({ id: fileTopics.id })
                  .from(fileTopics)
                  .where(
                    and(
                      eq(fileTopics.fileId, files.id),
                      eq(fileTopics.projectVersion, files.projectVersion),
                      eq(fileTopics.isDeleted, false),
                      or(
                        inArray(fileTopics.topicId, topicIds),
                        inArray(fileTopics.subtopicId, topicIds),
                      ),
                    ),
                  ),
              ),
        ),
        include: { topics: { where: { isDeleted: false } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    );
    return rows.map(fileWithTopicsResponse);
  }

  async getZip(zipId: string, projectVersion?: number): Promise<ZipFileResponse> {
    const row = await this.scope.query((database) =>
      dmsModels(database).zipFiles.findFirst({
        where: { id: zipId, projectVersion },
        orderBy: { projectVersion: "desc" },
      }),
    );
    if (!row) throw notFound({ message: "Zip file not found" });
    return zipFileResponse(row);
  }

  async listZips(input: ZipListInput): Promise<ZipFileResponse[]> {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;
    const accessibleIds = input.accessibleIds === undefined ? undefined : [...input.accessibleIds];
    const rows = await this.scope.query((database) =>
      dmsModels(database).zipFiles.findMany({
        where: {
          projectVersion: input.projectVersion,
          projectId:
            input.projectId === undefined
              ? { in: accessibleIds }
              : { equals: input.projectId, in: accessibleIds },
          workflowStatus: input.workflowStatus,
          type: input.fileType === undefined ? undefined : databaseFileType(input.fileType),
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    );
    return rows.map(zipFileResponse);
  }

  async downloadUrl(
    fileId: string,
    projectVersion: number,
    inline: boolean,
    includeDeleted: boolean,
    options?: { readonly internal?: boolean },
  ): Promise<{ projectId: string | null; downloadUrl: string }> {
    const row = await this.getFileRow(fileId, projectVersion, includeDeleted);
    if (!row) throw notFound({ message: `File '${fileId}' not found.` });
    if (row.workflowStatus !== null && row.workflowStatus !== "COMPLETED") {
      throw conflict({ message: `File '${fileId}' is not yet validated.` });
    }
    const downloadUrl = await this.cleanStorage.presignDownload(row.bucketPath, {
      expiresInSeconds: 4 * 60 * 60,
      contentType: row.mimeType,
      inline: inline && inlineMimeTypes.has(row.mimeType),
      internal: options?.internal,
    });
    const { projectId } = row;
    if (projectId !== null) {
      await this.scope.query((database) =>
        recordAuditEntry(database, {
          projectId,
          entityType: "file",
          entityId: row.id,
          changeType: "action",
          actionType: "download_url_issued",
        }),
      );
    } else {
      recordRequestAudit((actor) =>
        fileAudit.DOWNLOAD_URL_ISSUED({ actor, target: { id: row.id } }),
      );
    }
    return { projectId, downloadUrl };
  }

  private async readFileRow(
    fileId: string,
    projectVersion?: number,
  ): Promise<{ row: FileRow; bytes: Uint8Array }> {
    const row = await this.getFileRow(fileId, projectVersion);
    if (!row) throw notFound({ message: "File not found" });
    if (row.workflowStatus !== null && row.workflowStatus !== "COMPLETED") {
      throw conflict({ message: `File '${fileId}' is not yet validated.` });
    }
    const stored = await this.cleanStorage.download(row.bucketPath, this.maxObjectBytes);
    return { row, bytes: stored.bytes };
  }

  async readFile(fileId: string, projectVersion: number): Promise<Uint8Array> {
    return (await this.readFileRow(fileId, projectVersion)).bytes;
  }

  async readResultFile(
    fileId: string,
    projectVersion?: number,
  ): Promise<{ projectId: string | null; projectVersion: number; bytes: Uint8Array }> {
    const { row, bytes } = await this.readFileRow(fileId, projectVersion);
    return { projectId: row.projectId, projectVersion: row.projectVersion, bytes };
  }

  private async activeWorkflow(projectId: string): Promise<void> {
    const rows = await this.scope.query((database) =>
      database
        .select({
          workflowStatus: zipFiles.workflowStatus,
          approvalStatus: zipFiles.approvalStatus,
        })
        .from(zipFiles)
        .where(eq(zipFiles.projectId, projectId)),
    );
    if (rows.some((row) => row.workflowStatus === "REQUIRES_APPROVAL")) {
      throw conflict({
        message:
          `Cannot upload a file or start new ZIP processing for project ${projectId}: ` +
          "existing workflow is in state REQUIRES_APPROVAL.",
      });
    }
    if (rows.some((row) => row.workflowStatus === "RUNNING")) {
      throw conflict({
        message:
          `Cannot upload a file or start new ZIP processing for project ${projectId}: ` +
          "existing workflow is in state RUNNING.",
      });
    }
    if (
      rows.some(
        (row) => row.approvalStatus === "REQUIRES_APPROVAL" || row.approvalStatus === "APPROVING",
      )
    ) {
      throw conflict({
        message:
          `Cannot upload a file or start new ZIP processing for project ${projectId}: ` +
          "existing ZIP approval is still active.",
      });
    }
  }

  private async resolveProjectVersion(
    request: UploadRequest,
    supplied: number | undefined,
  ): Promise<number | undefined> {
    return request.projectId
      ? this.projectVersions.ensureWritable(
          request.projectId,
          supplied ?? (await this.projectVersions.latestOne(request.projectId)),
        )
      : supplied;
  }

  private fileScopeConditions(request: UploadRequest, projectVersion: number): SQL[] {
    const conditions: SQL[] = [
      eq(files.filename, request.filename),
      eq(files.type, databaseFileType(request.type)),
      eq(files.projectVersion, projectVersion),
      request.projectId === undefined
        ? isNull(files.projectId)
        : eq(files.projectId, request.projectId),
    ];
    if ("workflowId" in request) {
      conditions.push(eq(files.workflowId, request.workflowId), eq(files.runId, request.runId));
    }
    return conditions;
  }

  private async prepareVersion(
    request: UploadRequest,
    projectVersion: number,
  ): Promise<{ existing: FileRow | undefined; version: number }> {
    return this.scope.query(async (database) => {
      if (request.type === "zip" || request.type === "ewms_zip") {
        const rows = await database
          .select({ id: zipFiles.id })
          .from(zipFiles)
          .where(
            and(
              eq(zipFiles.filename, request.filename),
              eq(zipFiles.type, databaseFileType(request.type)),
              eq(zipFiles.projectId, request.projectId),
              eq(zipFiles.projectVersion, projectVersion),
            ),
          );
        return { existing: undefined, version: rows.length + 1 };
      }

      const conditions = this.fileScopeConditions(request, projectVersion);
      const [aggregate, active] = await Promise.all([
        database
          .select({ value: max(files.version) })
          .from(files)
          .where(and(...conditions)),
        database
          .select()
          .from(files)
          .where(and(...conditions, eq(files.isDeleted, false)))
          .orderBy(desc(files.version))
          .limit(1),
      ]);
      const existing = active[0];
      if (existing && !request.createNewVersion) {
        throw conflict({
          message:
            `File already exists (latest version ${existing.version}). ` +
            "Pass create_new_version=True to create a new version instead.",
          internal: { filename: request.filename },
        });
      }
      return { existing, version: Number(aggregate[0]?.value ?? 0) + 1 };
    });
  }

  private objectPath(request: UploadRequest, version: number, projectVersion: number): string {
    return buildObjectPath(request.filename, {
      type: request.type,
      version,
      revisionId: `project-${projectVersion}`,
      projectId: request.projectId,
      workflowId: "workflowId" in request ? request.workflowId : undefined,
      runId: "runId" in request ? request.runId : undefined,
    });
  }

  async generateUploadUrl(
    request: UploadRequest,
    suppliedProjectVersion?: number,
    options?: { readonly internal?: boolean },
  ): Promise<{ uploadUrl: string; mimeType: string }> {
    const projectVersion = await this.resolveProjectVersion(request, suppliedProjectVersion);
    if (
      request.projectId &&
      (request.type === "document" || request.type === "zip" || request.type === "ewms_zip")
    ) {
      await this.activeWorkflow(request.projectId);
    }
    const mimeType = mimeTypeForUpload(request.filename, request.type);
    const prepared = await this.prepareVersion(request, projectVersion ?? 1);
    const bucketPath = this.objectPath(request, prepared.version, projectVersion ?? 1);
    const storage = this.storageFor(request.type);
    const uploadPath = storage === this.cleanStorage ? `uploads/${bucketPath}` : bucketPath;
    const uploadUrl = await storage.presignUpload(uploadPath, {
      expiresInSeconds: 15 * 60,
      contentType: mimeType,
      createNewVersion: request.createNewVersion,
      internal: options?.internal,
    });
    return { uploadUrl, mimeType };
  }

  async writeInternalFile(input: InternalFileWriteInput): Promise<FileResponse> {
    const request = {
      type: input.type,
      filename: input.filename,
      projectId: input.projectId,
      createNewVersion: true,
    } satisfies UploadRequest;
    const projectVersion = (await this.resolveProjectVersion(request, undefined)) ?? 1;
    const prepared = await this.prepareVersion(request, projectVersion);
    const bucketPath = this.objectPath(request, prepared.version, projectVersion);
    const storage = this.storageFor(request.type);
    const mimeType = mimeTypeForUpload(request.filename, request.type);
    await storage.upload(bucketPath, input.content, { contentType: mimeType });
    const row = await this.scope.transact(async () => {
      await this.resolveProjectVersion(request, projectVersion);
      return this.insertFile(
        request,
        projectVersion,
        prepared.version,
        bucketPath,
        mimeType,
        prepared.existing,
      );
    });
    return fileResponse(row);
  }

  async writeProjectFile(input: {
    readonly projectId: string;
    readonly projectVersion: number;
    readonly fileType: "document" | "zip";
    readonly filename: string;
    readonly content: Uint8Array;
  }): Promise<FileResponse | ZipFileResponse> {
    const request = {
      type: input.fileType,
      filename: input.filename,
      projectId: input.projectId,
      createNewVersion: false,
    } as const;
    const mimeType = mimeTypeForUpload(input.filename, input.fileType);
    if (input.fileType !== "zip" && input.content.byteLength > this.maxObjectBytes)
      throw DmsValidationError({ message: "Uploaded file exceeds the maximum size" });
    const sha256 = new Bun.CryptoHasher("sha256").update(input.content).digest("hex");
    const bucketPath = buildObjectPath(input.filename, {
      type: input.fileType,
      projectId: input.projectId,
      version: 1,
      revisionId: `project-${input.projectVersion}/sha256-${sha256}`,
    });
    const table = input.fileType === "zip" ? zipFiles : files;
    const identity = and(
      eq(table.projectId, input.projectId),
      eq(table.projectVersion, input.projectVersion),
      eq(table.bucketPath, bucketPath),
      eq(table.isDeleted, false),
    );
    const [existing] = await this.scope.query((database) =>
      database.select().from(table).where(identity).limit(1),
    );
    if (existing)
      return "mimeType" in existing ? fileResponse(existing) : zipFileResponse(existing);
    await this.resolveProjectVersion(request, input.projectVersion);
    await this.activeWorkflow(input.projectId);
    const storage = this.storageFor(input.fileType);
    await storage.upload(bucketPath, input.content, {
      contentType: mimeType,
      metadata: { sha256 },
    });
    const row = await this.scope.transact(async () => {
      await this.resolveProjectVersion(request, input.projectVersion);
      const [accepted] = await this.scope.query((database) =>
        database.select().from(table).where(identity).limit(1),
      );
      if (accepted) return accepted;
      await this.activeWorkflow(input.projectId);
      const prepared = await this.prepareVersion(request, input.projectVersion);
      if (input.fileType === "zip")
        return this.insertZip(request, input.projectVersion, bucketPath);
      return this.insertFile(
        request,
        input.projectVersion,
        prepared.version,
        bucketPath,
        mimeType,
        prepared.existing,
        this.scanningEnabled ? "PENDING" : null,
      );
    });
    return "mimeType" in row ? fileResponse(row) : zipFileResponse(row);
  }

  private async insertFile(
    request: UploadRequest,
    projectVersion: number,
    version: number,
    bucketPath: string,
    mimeType: string,
    existing: FileRow | undefined,
    workflowStatus: FileRow["workflowStatus"] = null,
  ): Promise<FileRow> {
    return this.scope.query(async (database) => {
      if (existing) {
        await database
          .update(files)
          .set({ isDeleted: true })
          .where(and(eq(files.id, existing.id), eq(files.projectVersion, existing.projectVersion)));
      }
      const row: typeof files.$inferInsert = {
        id: crypto.randomUUID(),
        type: databaseFileType(request.type),
        filename: request.filename,
        mimeType,
        version,
        bucketPath,
        projectId: request.projectId ?? null,
        projectVersion,
        addedInVersion: projectVersion,
        workflowId: "workflowId" in request ? request.workflowId : null,
        runId: "runId" in request ? request.runId : null,
        workflowStatus,
        isDeleted: false,
        isOutdated: false,
        frontendParentIds: [],
        updateType: "AUTOMATED",
      };
      const inserted = await database.insert(files).values(row).returning();
      const value = inserted[0];
      if (!value) throw new Error("File insert did not return a row");
      if (value.projectId) {
        await recordAuditEntry(database, {
          projectId: value.projectId,
          entityId: value.id,
          entityType: "file",
          changeType: "create",
        });
      }
      return value;
    });
  }

  private async markPending(row: FileRow): Promise<FileRow> {
    const updated = await this.scope.transact(() =>
      this.scope.query((database) =>
        database
          .update(files)
          .set({ workflowStatus: "PENDING" })
          .where(and(eq(files.id, row.id), eq(files.projectVersion, row.projectVersion)))
          .returning(),
      ),
    );
    const value = updated[0];
    if (!value) throw new Error("File status update did not return a row");
    return value;
  }

  private async insertZip(
    request: UploadRequest & { projectId: string },
    projectVersion: number,
    bucketPath: string,
  ): Promise<ZipFileRow> {
    return this.scope.query(async (database) => {
      const row: typeof zipFiles.$inferInsert = {
        id: crypto.randomUUID(),
        type: databaseFileType(request.type),
        filename: request.filename,
        bucketPath,
        projectId: request.projectId,
        projectVersion,
        workflowStatus: "PENDING",
        approvalStatus: null,
        approvalError: null,
        workflowFailureCode: null,
        sourceProjectVersion: null,
        isDeleted: false,
        isOutdated: false,
        frontendParentIds: [],
        updateType: "AUTOMATED",
      };
      const inserted = await database.insert(zipFiles).values(row).returning();
      const value = inserted[0];
      if (!value) throw new Error("ZIP insert did not return a row");
      await recordAuditEntry(database, {
        projectId: request.projectId,
        entityId: value.id,
        entityType: "zip_file",
        changeType: "create",
      });
      return value;
    });
  }

  async confirmUpload(
    request: UploadRequest,
    suppliedProjectVersion?: number,
  ): Promise<FileRow | ZipFileRow> {
    const projectVersion = await this.resolveProjectVersion(request, suppliedProjectVersion);
    const resolvedProjectVersion = projectVersion ?? 1;
    const prepared = await this.prepareVersion(request, resolvedProjectVersion);
    const bucketPath = this.objectPath(request, prepared.version, resolvedProjectVersion);
    const storage = this.storageFor(request.type);
    const uploadPath = storage === this.cleanStorage ? `uploads/${bucketPath}` : bucketPath;
    let metadata;
    try {
      metadata = await storage.head(uploadPath);
    } catch (error) {
      if (EvlogError.isEvlogError(error) && error.code === StorageNotFoundError.code) {
        throw notFound({ message: "Uploaded file not found in storage", internal: { bucketPath } });
      }
      throw error;
    }
    const isZip = request.type === "zip" || request.type === "ewms_zip";
    if (metadata.contentLength === null || (!isZip && metadata.contentLength > this.maxObjectBytes)) {
      await storage.delete(uploadPath);
      throw DmsValidationError({
        message: `Uploaded file exceeds the maximum size of ${this.maxObjectBytes} bytes`,
      });
    }
    if (!metadata.contentType)
      throw DmsHttpError({
        message: "Uploaded file does not have a MIME type set",
        internal: { bucketPath },
      });

    if (storage === this.cleanStorage) {
      const hash = new Bun.CryptoHasher("sha256");
      for await (const chunk of storage.file(uploadPath).stream()) hash.update(chunk);
      await storage.copy(uploadPath, bucketPath, { expectedSha256: hash.digest("hex") });
    }

    const inserted = await this.scope.transact(async (): Promise<FileRow | ZipFileRow> => {
      await this.resolveProjectVersion(request, resolvedProjectVersion);
      if (isZip) {
        return this.insertZip(request, resolvedProjectVersion, bucketPath);
      }
      return this.insertFile(
        request,
        resolvedProjectVersion,
        prepared.version,
        bucketPath,
        metadata.contentType!,
        prepared.existing,
      );
    });

    if (storage === this.cleanStorage) {
      try {
        await storage.delete(uploadPath);
      } catch (error) {
        log.warn({ message: "Confirmed upload staging cleanup failed", uploadPath, error });
      }
    }

    if ("mimeType" in inserted && this.scanningEnabled && storage === this.quarantineStorage) {
      return this.markPending(inserted);
    }
    return inserted;
  }
}
