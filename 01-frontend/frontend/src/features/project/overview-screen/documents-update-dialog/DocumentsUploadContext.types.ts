import type { UploadZipFailureStage } from './dialog-logic/useZipUpload';
import type { ZipWorkflowFailureCode } from '@/features/project/data/file-processing/zipProcessingFailureMessages';

export type UploadFileStatus = 'queued' | 'uploading' | 'success' | 'error';

export type UploadFileError = 'unsupported-format' | 'upload-failed';

export type UploadFile = {
  id: string;
  file: File;
  status: UploadFileStatus;
  errorReason?: UploadFileError;
};

export type UploadPhase =
  | 'idle'
  | 'selecting'
  | 'uploading'
  | 'diff'
  | 'approval-initializing'
  | 'upload-success'
  | 'ai-processes';

export type UploadGlobalError =
  | 'zip-required'
  | 'single-zip-required'
  | 'upload-failed'
  | 'processing-failed';

export type UploadErrorDetails = {
  kind: UploadGlobalError;
  stage?: UploadZipFailureStage;
  error?: unknown;
  workflowFailureCode?: ZipWorkflowFailureCode | null;
};
