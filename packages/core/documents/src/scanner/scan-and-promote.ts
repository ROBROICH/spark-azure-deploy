import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { and, eq } from "drizzle-orm";
import { EvlogError } from "evlog";

import type { DmsScope } from "../db.ts";
import { files } from "../db/schema.ts";
import { conflict, DmsValidationError } from "../errors.ts";
import type { FileType } from "../files/file-types.ts";
import { apiFileType, mimeTypeForUpload } from "../files/file-types.ts";
import type { FileService } from "../files/file-service.ts";
import {
  StorageNotFoundError,
  StorageConflictError,
  type S3Storage,
  type StoredObject,
} from "../storage/s3-storage.ts";
import type { ClamAvClient, VirusScanResult } from "./clamav-client.ts";

export interface ScanAndPromoteInput {
  readonly fileId: string;
  readonly projectVersion?: number;
  readonly bucketPath: string;
  readonly filename: string;
  readonly fileType?: FileType;
}

const startsWith = (bytes: Uint8Array, prefix: readonly number[]): boolean =>
  prefix.every((value, index) => bytes[index] === value);

const validateContent = (filename: string, type: FileType, object: StoredObject): void => {
  const expected = mimeTypeForUpload(filename, type);
  if (object.contentType !== null && object.contentType !== expected) {
    throw DmsValidationError({
      message: `Uploaded MIME type '${object.contentType}' does not match expected '${expected}'`,
    });
  }
  const clean =
    expected === "application/pdf"
      ? startsWith(object.bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
      : expected === "application/zip"
        ? startsWith(object.bytes, [0x50, 0x4b])
        : expected === "image/png"
          ? startsWith(object.bytes, [0x89, 0x50, 0x4e, 0x47])
          : expected === "image/jpeg"
            ? startsWith(object.bytes, [0xff, 0xd8, 0xff])
            : true;
  if (!clean) throw DmsValidationError({ message: `File content does not match '${expected}'` });
};

export class ScanAndPromoteService {
  constructor(
    private readonly scope: DmsScope,
    private readonly filesService: FileService,
    private readonly clean: S3Storage,
    private readonly quarantine: S3Storage,
    private readonly scanner: ClamAvClient,
  ) {}

  private async updateStatus(
    fileId: string,
    projectId: string,
    projectVersion: number,
    status: "COMPLETED" | "FAILED",
  ): Promise<void> {
    await this.scope.transact(() =>
      this.scope.query(async (database) => {
        const updated = await database
          .update(files)
          .set({ workflowStatus: status })
          .where(and(eq(files.id, fileId), eq(files.projectVersion, projectVersion)))
          .returning({ id: files.id });
        if (updated.length !== 1) {
          throw new Error(`File '${fileId}' not found at project version ${projectVersion}`);
        }
        await recordAuditEntry(database, {
          projectId,
          entityId: fileId,
          entityType: "file",
          changeType: "update",
        });
      }),
    );
  }

  async execute(input: ScanAndPromoteInput): Promise<VirusScanResult> {
    const candidates = await this.scope.query((database) =>
      database
        .select()
        .from(files)
        .where(
          and(
            eq(files.id, input.fileId),
            eq(files.bucketPath, input.bucketPath),
            input.projectVersion === undefined
              ? undefined
              : eq(files.projectVersion, input.projectVersion),
          ),
        )
        .limit(2),
    );
    if (candidates.length > 1) throw conflict({ message: "File processing version is unresolved" });
    const row = candidates[0];
    if (!row || row.projectId === null) throw new Error(`File '${input.fileId}' not found`);
    let object: StoredObject;
    try {
      object = await this.quarantine.download(input.bucketPath, this.filesService.maxObjectBytes);
    } catch (error) {
      if (EvlogError.isEvlogError(error) && error.code === DmsValidationError.code) {
        await this.updateStatus(input.fileId, row.projectId, row.projectVersion, "FAILED");
      }
      if (!(EvlogError.isEvlogError(error) && error.code === StorageNotFoundError.code))
        throw error;
      object = await this.clean.download(input.bucketPath, this.filesService.maxObjectBytes);
      if (
        object.metadata["file-id"] !== row.id ||
        object.metadata["project-version"] !== String(row.projectVersion)
      ) {
        throw StorageConflictError({
          message: "Published object does not belong to this file revision",
        });
      }
    }
    try {
      validateContent(row.filename, apiFileType(row.type), object);
    } catch (error) {
      await this.updateStatus(input.fileId, row.projectId, row.projectVersion, "FAILED");
      throw error;
    }

    const result = await this.scanner.scanBytes(object.bytes);
    if (!result.isClean) {
      await this.updateStatus(input.fileId, row.projectId, row.projectVersion, "FAILED");
      try {
        await this.quarantine.delete(input.bucketPath);
      } catch (error) {
        if (!(EvlogError.isEvlogError(error) && error.code === StorageNotFoundError.code))
          throw error;
      }
      return result;
    }

    if (this.clean !== this.quarantine) {
      const sha256 = new Bun.CryptoHasher("sha256").update(object.bytes).digest("hex");
      await this.clean.upload(input.bucketPath, object.bytes, {
        contentType: mimeTypeForUpload(row.filename, apiFileType(row.type)),
        metadata: {
          ...object.metadata,
          sha256,
          "file-id": row.id,
          "project-version": String(row.projectVersion),
        },
      });
    }
    await this.updateStatus(input.fileId, row.projectId, row.projectVersion, "COMPLETED");
    if (this.clean !== this.quarantine) {
      try {
        await this.quarantine.delete(input.bucketPath);
      } catch (error) {
        if (!(EvlogError.isEvlogError(error) && error.code === StorageNotFoundError.code))
          throw error;
      }
    }
    return result;
  }
}
