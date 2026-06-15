import type { UploadZipFailureStage } from './dialog-logic/useZipUpload';

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
  | 'upload-failed'
  | 'processing-failed';

export type UploadErrorDetails = {
  kind: UploadGlobalError;
  stage?: UploadZipFailureStage;
  error?: unknown;
};
