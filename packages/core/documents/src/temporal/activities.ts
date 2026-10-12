import { type ScanAndPromoteInput } from "../scanner/scan-and-promote.ts";
import { ApplicationFailure } from "@temporalio/common";
import { EvlogError } from "evlog";
import {
  extractZipArchive,
  validateZipArchive,
  zipActivityResult,
  type ZipLimits,
} from "../files/zip-extraction.ts";
import { DmsValidationError } from "../errors.ts";
import type { VirusScanResult } from "../scanner/clamav-client.ts";
import { StorageNotFoundError } from "../storage/s3-storage.ts";
import { DmsActivityNotFoundError, type DmsActivityRepository } from "./activity-repository.ts";
import type { SingleFileResult } from "./contracts.ts";
import { computeFileDiff, type DiffStorage } from "./diff.ts";
import type { DmsActivities } from "./registrations.ts";

export interface ActivityStorage extends DiffStorage {
  head(path: string): Promise<{
    readonly contentLength: number | null;
    readonly contentType: string | null;
    readonly metadata: Readonly<Record<string, string>>;
  }>;
  upload(
    path: string,
    bytes: Uint8Array,
    options?: {
      readonly overwrite?: boolean;
      readonly contentType?: string;
      readonly metadata?: Readonly<Record<string, string>>;
    },
  ): Promise<void>;
  delete(path: string): Promise<void>;
}

export interface DmsActivityDependencies {
  readonly repository: DmsActivityRepository;
  readonly zipSourceStorage: ActivityStorage;
  readonly cleanStorage: ActivityStorage;
  readonly scanner: {
    scanBytes(bytes: Uint8Array): Promise<VirusScanResult>;
  };
  readonly scanAndPromote: {
    execute(input: ScanAndPromoteInput): Promise<VirusScanResult>;
  };
  readonly config: {
    readonly zipLimits: ZipLimits;
  };
}

const failed = (
  filename: string,
  action: string,
  errorCode: string,
  errorMessage: string,
  bucketPath: string | null = null,
): SingleFileResult => ({
  success: false,
  filename,
  action,
  fileId: null,
  bucketPath: bucketPath,
  errorCode: errorCode,
  errorMessage: errorMessage,
});

const successful = (
  filename: string,
  action: string,
  fileId: string | null,
  bucketPath: string | null = null,
): SingleFileResult => ({
  success: true,
  filename,
  action,
  fileId: fileId,
  bucketPath: bucketPath,
  errorCode: null,
  errorMessage: null,
});

export function createDmsActivities(dependencies: DmsActivityDependencies): DmsActivities {
  return {
    validateZip: async (input) =>
      zipActivityResult(
        await validateZipArchive(
          dependencies.zipSourceStorage,
          input.zipPath,
          dependencies.config.zipLimits,
        ),
      ),

    extractZip: async (input) =>
      zipActivityResult(
        await extractZipArchive(
          {
            source: dependencies.zipSourceStorage,
            target: dependencies.cleanStorage,
            scanner: dependencies.scanner,
            limits: dependencies.config.zipLimits,
          },
          input,
        ),
      ),

    async deleteZipSource(input) {
      try {
        await dependencies.zipSourceStorage.delete(input.zipPath);
      } catch (error) {
        if (EvlogError.isEvlogError(error) && error.code === StorageNotFoundError.code) return;
        throw error;
      }
    },

    async createDiff(input) {
      const target = await dependencies.repository.listFiles({
        projectId: input.projectId,
        projectVersion: input.projectVersion,
        fileType: input.entryFileType,
      });
      return computeFileDiff(input, target, dependencies.cleanStorage);
    },

    async ingestFile(input) {
      try {
        const id = await dependencies.repository.ingestFile(input);
        return successful(input.filename, "INGEST", id);
      } catch (error) {
        if (
          error instanceof DmsActivityNotFoundError ||
          (EvlogError.isEvlogError(error) && error.code === StorageNotFoundError.code)
        ) {
          return failed(
            input.filename,
            "INGEST",
            "FILE_NOT_FOUND",
            "File to move into DMS not found in storage",
          );
        }
        return failed(input.filename, "INGEST", "UPLOAD_FAILED", "Failed to ingest file");
      }
    },

    async renameFile(input) {
      try {
        if (!(await dependencies.repository.renameFile(input))) {
          return failed(
            input.newName,
            "RENAME",
            "FILE_NOT_FOUND",
            "File to rename not found in DMS",
          );
        }
        return successful(input.newName, "RENAME", input.fileId);
      } catch {
        return failed(input.newName, "RENAME", "RENAME_FAILED", "Failed to rename file");
      }
    },

    persistZipDiff: (input) => dependencies.repository.persistZipDiff(input),
    updateFileStatus: (input) => dependencies.repository.updateZipStatus(input),
    updateFileWorkflowStatus: (input) => dependencies.repository.updateFileStatus(input),
    updateZipApprovalStatus: (input) => dependencies.repository.updateZipApprovalStatus(input),

    async scanAndUpload(input) {
      let result: VirusScanResult;
      try {
        result = await dependencies.scanAndPromote.execute({
          fileId: input.fileId,
          projectVersion: input.projectVersion,
          bucketPath: input.bucketPath,
          filename: input.filename,
          fileType: input.fileType,
        });
      } catch (error) {
        if (EvlogError.isEvlogError(error) && error.code === DmsValidationError.code) {
          throw ApplicationFailure.create({
            message: error.message,
            type: "UPLOAD_FAILED",
            nonRetryable: true,
            cause: error,
          });
        }
        throw error;
      }
      if (!result.isClean) {
        throw ApplicationFailure.create({
          message: `Virus detected: ${result.threatName ?? "unknown threat"}`,
          type: "VIRUS_DETECTED",
          nonRetryable: true,
        });
      }
    },
  };
}
