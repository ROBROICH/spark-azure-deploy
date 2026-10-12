import {
  DmsSingleFileProcessingInput as DmsSingleFileProcessingInputSchema,
  DmsZipFileProcessingInput as DmsZipFileProcessingInputSchema,
  type CreateProjectVersionInput,
  type DmsFileProcessingOutput,
  type Static,
} from "@spark-temporal/contracts";

import type { ZipFailureCode, ZipWorkflowFailureCode } from "./zip-failure-codes.ts";

export type DmsSingleFileProcessingInput = Static<typeof DmsSingleFileProcessingInputSchema>;
export type DmsZipFileProcessingInput = Static<typeof DmsZipFileProcessingInputSchema>;

export type WorkflowStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED"
  | "TERMINATED"
  | "CONTINUED_AS_NEW"
  | "TIMED_OUT"
  | "REQUIRES_APPROVAL";

export type ZipApprovalStatus =
  | "REQUIRES_APPROVAL"
  | "APPROVING"
  | "APPROVED"
  | "FAILED_APPROVE"
  | "REJECTED";

export type { ZipFailureCode, ZipWorkflowFailureCode } from "./zip-failure-codes.ts";

export interface ZipFailure {
  readonly code: ZipFailureCode;
  readonly message: string;
}

/** Activity payload for a ZIP step whose domain failure the workflow persists. */
export type ZipActivityResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ZipFailure };

export interface SingleFileResult {
  readonly success: boolean;
  readonly filename: string;
  readonly action: string;
  readonly fileId: string | null;
  readonly bucketPath: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
}

export interface NewFile {
  readonly filename: string;
  readonly bucketPath: string;
  readonly sha: string | null;
}

export interface DeleteChange {
  readonly fileId: string;
  readonly filename: string;
  readonly sha: string;
}

export interface FileChange {
  readonly fileId: string;
  readonly bucketPath: string;
  readonly filename: string;
  readonly sourceSha: string;
  readonly targetSha: string;
}

export interface RenameChange {
  readonly fileId: string;
  readonly oldName: string;
  readonly newName: string;
  readonly sha: string;
  readonly bucketPath?: string | null;
}

export interface UnchangedFile {
  readonly fileId: string;
  readonly filename: string;
  readonly sha: string;
}

export interface DuplicateFile {
  readonly filename: string;
  readonly bucketPath: string;
  readonly existingFileId: string;
}

export interface FileDiffResult {
  readonly new: readonly NewFile[];
  readonly deleted: readonly DeleteChange[];
  readonly changed: readonly FileChange[];
  readonly renamed: readonly RenameChange[];
  readonly unchanged: readonly UnchangedFile[];
  readonly duplicate: readonly DuplicateFile[];
}

export interface ValidateZipInput {
  readonly zipPath: string;
  readonly filename: string;
}

export interface ValidateZipOutput {
  readonly entryCount: number;
  readonly totalUncompressedSize: number;
}

export interface ExtractZipInput {
  readonly zipFileId: string;
  readonly filename: string;
  readonly projectId: string;
  readonly zipPath: string;
  readonly fileType: "zip" | "ewms_zip";
}

export interface DeleteZipSourceInput {
  readonly zipPath: string;
}

export interface ComputeDiffInput {
  readonly projectId: string;
  readonly zipFileId: string;
  readonly files: readonly SingleFileResult[];
  readonly projectVersion: number;
  readonly entryFileType: "document" | "ewms_document";
  readonly renameSimilarityThreshold?: number;
  readonly renameSameDirOnly?: boolean;
}

export interface IngestFileInput {
  readonly zipFileId: string;
  readonly projectId: string;
  readonly projectVersion: number;
  readonly filename: string;
  readonly bucketPath: string;
  readonly entryFileType: "document" | "ewms_document";
  readonly fileId: string | null;
}

export interface RenameFileInput {
  readonly projectId: string;
  readonly projectVersion: number;
  readonly fileId: string;
  readonly oldName: string;
  readonly newName: string;
}

export interface PersistZipDiffInput {
  readonly zipFileId: string;
  readonly sourceProjectVersion: number;
  readonly diff: FileDiffResult;
}

export interface UpdateZipStatusInput {
  readonly zipFileId: string;
  readonly status: WorkflowStatus;
  readonly workflowFailureCode?: ZipWorkflowFailureCode | null;
}

export interface UpdateFileStatusInput {
  readonly fileId: string;
  readonly projectVersion?: number;
  readonly status: WorkflowStatus;
}

export interface UpdateZipApprovalStatusInput {
  readonly zipFileId: string;
  readonly status: ZipApprovalStatus | null;
  readonly error?: string | null;
}

export interface ScanAndUploadInput {
  readonly projectVersion?: number;
  readonly fileId: string;
  readonly bucketPath: string;
  readonly filename: string;
  readonly fileType: "document" | "erwiderungs_import" | "template";
}

export type ProjectVersionChildInput = CreateProjectVersionInput;

export interface EwmsChildInput {
  readonly projectId: string;
  readonly fileIds: readonly string[];
  readonly projectVersion: number;
}

export type FileProcessingOutput = DmsFileProcessingOutput;
export type FileProcessingSuccess = FileProcessingOutput["successful"][number];
export type FileProcessingFailure = FileProcessingOutput["failed"][number];

export interface DmsWorkflowRuntime {
  validateZip(input: ValidateZipInput): Promise<ZipActivityResult<ValidateZipOutput>>;
  extractZip(input: ExtractZipInput): Promise<ZipActivityResult<SingleFileResult[]>>;
  deleteZipSource(input: DeleteZipSourceInput): Promise<void>;
  createDiff(input: ComputeDiffInput): Promise<FileDiffResult>;
  ingestFile(input: IngestFileInput): Promise<SingleFileResult>;
  renameFile(input: RenameFileInput): Promise<SingleFileResult>;
  persistZipDiff(input: PersistZipDiffInput): Promise<void>;
  updateZipStatus(input: UpdateZipStatusInput): Promise<void>;
  updateFileStatus(input: UpdateFileStatusInput): Promise<void>;
  updateZipApprovalStatus(input: UpdateZipApprovalStatusInput): Promise<void>;
  scanAndUpload(input: ScanAndUploadInput): Promise<void>;
  createProjectVersion(input: ProjectVersionChildInput): Promise<number>;
  startEwms(input: EwmsChildInput): Promise<void>;
  isCancellation(error: Error): boolean;
}
