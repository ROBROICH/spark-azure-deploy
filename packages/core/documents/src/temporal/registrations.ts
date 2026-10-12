import type {
  ComputeDiffInput,
  DeleteZipSourceInput,
  ExtractZipInput,
  FileDiffResult,
  IngestFileInput,
  PersistZipDiffInput,
  RenameFileInput,
  ScanAndUploadInput,
  SingleFileResult,
  UpdateFileStatusInput,
  UpdateZipApprovalStatusInput,
  UpdateZipStatusInput,
  ValidateZipInput,
  ValidateZipOutput,
  ZipActivityResult,
} from "./contracts.ts";

export interface DmsActivities {
  createDiff(input: ComputeDiffInput): Promise<FileDiffResult>;
  extractZip(input: ExtractZipInput): Promise<ZipActivityResult<SingleFileResult[]>>;
  deleteZipSource(input: DeleteZipSourceInput): Promise<void>;
  ingestFile(input: IngestFileInput): Promise<SingleFileResult>;
  persistZipDiff(input: PersistZipDiffInput): Promise<void>;
  renameFile(input: RenameFileInput): Promise<SingleFileResult>;
  scanAndUpload(input: ScanAndUploadInput): Promise<void>;
  updateFileStatus(input: UpdateZipStatusInput): Promise<void>;
  updateFileWorkflowStatus(input: UpdateFileStatusInput): Promise<void>;
  updateZipApprovalStatus(input: UpdateZipApprovalStatusInput): Promise<void>;
  validateZip(input: ValidateZipInput): Promise<ZipActivityResult<ValidateZipOutput>>;
}
