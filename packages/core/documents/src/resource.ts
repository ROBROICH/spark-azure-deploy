import { defineResource } from "@spark-workflow/resource";
import type { NodeVersionService } from "@spark-workflow/node-crud";

import type {
  DocumentCommandConfiguration as DocumentCommandConfigurationValue,
  DocumentConfiguration as DocumentConfigurationValue,
} from "./env.ts";
import type { FileDiff } from "./schemas.ts";
import type { FileResponse, ZipFileResponse } from "./schemas.ts";
import type { DocumentTemporalCommandsService } from "./temporal/commands.ts";
export type { FileResponse, ZipFileResponse } from "./schemas.ts";

export const DocumentConfiguration = defineResource<DocumentConfigurationValue>()(
  "core/DocumentConfiguration",
);
export const DocumentCommandConfiguration = defineResource<DocumentCommandConfigurationValue>()(
  "core/DocumentCommandConfiguration",
);
export const DocumentTemporalCommands = defineResource<DocumentTemporalCommandsService>()(
  "core/DocumentTemporalCommands",
);

export interface DocumentResultFile {
  readonly projectId: string | null;
  readonly projectVersion: number;
  readonly bytes: Uint8Array;
}

export interface DocumentsService {
  readResultFile(fileId: string, projectVersion?: number): Promise<DocumentResultFile>;
}

export const Documents = defineResource<DocumentsService>()("core/Documents");

export interface DocumentFileMetadata {
  readonly id: string;
  readonly type: string;
  readonly filename: string;
  readonly projectId: string | null;
  readonly projectVersion: number;
}

export interface DocumentFilesService {
  getFile(fileId: string, projectVersion: number): Promise<FileResponse>;
  getZipFile(fileId: string, projectVersion: number): Promise<ZipFileResponse>;
  listProjectFiles(
    projectId: string,
    projectVersion: number,
    fileType: "document" | "ewms_document",
  ): Promise<readonly FileResponse[]>;
  updateFileTopics(
    fileId: string,
    projectVersion: number,
    topics: readonly string[],
  ): Promise<FileResponse>;
  uploadProjectFile(input: {
    readonly projectId: string;
    readonly projectVersion: number;
    readonly fileType: "document" | "zip";
    readonly filename: string;
    readonly content: Uint8Array;
  }): Promise<FileResponse | ZipFileResponse | null>;
  uploadInternalFile(input: {
    readonly projectId: string;
    readonly fileType: "erwiderungs_export";
    readonly filename: string;
    readonly content: Uint8Array;
  }): Promise<string>;
  downloadFile(fileId: string, projectVersion: number): Promise<Uint8Array>;
}

export const DocumentFiles = defineResource<DocumentFilesService>()("core/DocumentFiles");

export interface DocumentManagementVersioningService extends NodeVersionService {
  getZipDiff(projectId: string, zipFileId: string, sourceVersion: number): Promise<FileDiff>;
  updateZipApprovalStatus(
    projectId: string,
    zipFileId: string,
    approvalStatus: "APPROVED" | "APPROVING" | "FAILED_APPROVE" | "REJECTED" | "REQUIRES_APPROVAL",
    error: string | null,
  ): Promise<{ readonly approvalStatus: string; readonly error: string | null }>;
  commitZipDiff(input: {
    readonly projectId: string;
    readonly zipFileId: string;
    readonly sourceVersion: number;
    readonly targetVersion: number;
    readonly lockToken: string;
    readonly dryRun: boolean;
  }): Promise<{
    readonly dryRun: boolean;
    readonly new: number;
    readonly changed: number;
    readonly renamed: number;
    readonly unchanged: number;
  }>;
}

export const DocumentManagementVersioning = defineResource<DocumentManagementVersioningService>()(
  "core/DocumentManagementVersioning",
);
