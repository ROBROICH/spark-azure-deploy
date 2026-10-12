import {
  v1DocumentManagementConfirmFileUpload as confirmFileUpload,
  v1DocumentManagementGenerateFileUploadUrl as generateFileUploadUrl,
  v1DocumentManagementStartFileProcessing as startFileProcessing,
  type V1DocumentManagementConfirmFileUploadResponse as ConfirmFileUploadResponse,
  type UploadUrlResponse,
  type V1DocumentManagementStartFileProcessingResponse as StartFileProcessingResponse,
  type WorkflowStatusEnum,
  v1ObjectionsManagementImportObjectionsArguments as importObjectionsArguments,
  type V1ObjectionsManagementImportObjectionsArgumentsResponse as ImportObjectionsArgumentsResponse,
} from '@/api-clients/backend';
import { uploadFileToStorage } from '@/features/shared/remote-files/uploadFileToStorage';
import { waitForTemporalWorkflowCompletion } from '../data/temporalWorkflowPolling';

type ClientResult<TData> = {
  data?: TData;
  error?: unknown;
};

const SCAN_WORKFLOW_POLL_INTERVAL_MS = 1000;
const COMPLETED_DMS_WORKFLOW_STATUS: WorkflowStatusEnum = 'COMPLETED';
const FAILED_DMS_WORKFLOW_STATUSES: WorkflowStatusEnum[] = [
  'FAILED',
  'CANCELED',
  'TERMINATED',
  'TIMED_OUT',
];

const hasStringDetail = (value: unknown): value is { detail: string } =>
  typeof value === 'object' &&
  value !== null &&
  'detail' in value &&
  typeof value.detail === 'string';

const hasMessage = (value: unknown): value is { message: string } =>
  typeof value === 'object' &&
  value !== null &&
  'message' in value &&
  typeof value.message === 'string';

const getImportErrorMessage = (error: unknown, fallback: string) => {
  if (hasStringDetail(error)) {
    return error.detail;
  }

  if (hasMessage(error)) {
    return error.message;
  }

  return fallback;
};

const getConfirmedFileId = (
  confirmedUpload: NonNullable<ConfirmFileUploadResponse>,
) => {
  if ('id' in confirmedUpload && typeof confirmedUpload.id === 'string') {
    return confirmedUpload.id;
  }

  throw new Error('Erwiderung import upload did not return a file id.');
};

const startErwiderungImportScan = async (params: {
  fileId: string;
  projectId: string;
}): Promise<StartFileProcessingResponse> => {
  const { fileId, projectId } = params;
  // The generated endpoint docs mention ZIPs, but DMS also accepts
  // erwiderungs_import CSV files here for the virus-scan step.
  const processingResponse = (await startFileProcessing({
    body: {
      fileId,
      projectId,
    },
  })) as ClientResult<StartFileProcessingResponse>;

  if (processingResponse.error) {
    throw new Error(
      getImportErrorMessage(
        processingResponse.error,
        'Erwiderung import scan could not be started.',
      ),
    );
  }

  if (!processingResponse.data) {
    throw new Error('Erwiderung import scan response is empty.');
  }

  if (
    FAILED_DMS_WORKFLOW_STATUSES.includes(
      processingResponse.data.workflowStatus,
    )
  ) {
    throw new Error(
      `Erwiderung import scan ended with status ${processingResponse.data.workflowStatus}.`,
    );
  }

  return processingResponse.data;
};

const waitForErwiderungImportScan = async (
  processingWorkflow: StartFileProcessingResponse,
) => {
  // DMS returns COMPLETED immediately when virus scanning is disabled (for
  // example in test environments), without starting a Temporal workflow. In that
  // case the file is already in its final storage location and the OMS import
  // can continue directly.
  if (processingWorkflow.workflowStatus === COMPLETED_DMS_WORKFLOW_STATUS) {
    return;
  }
  if (!processingWorkflow.workflowId) {
    throw new Error('Erwiderung import scan did not start a workflow.');
  }

  await waitForTemporalWorkflowCompletion({
    emptyResponseMessage: 'Erwiderung import scan status response is empty.',
    failedStatusMessagePrefix: 'Erwiderung import scan workflow',
    getErrorMessage: getImportErrorMessage,
    pollIntervalMs: SCAN_WORKFLOW_POLL_INTERVAL_MS,
    requestFailedFallback: 'Erwiderung import scan status request failed.',
    workflowId: processingWorkflow.workflowId,
  });
};

/**
 * Uploads an Erwiderung import file through DMS and passes the confirmed file
 * id to OMS so existing arguments can receive imported response text.
 */
export const uploadErwiderungImportFile = async (params: {
  file: File;
  projectId: string;
}): Promise<ImportObjectionsArgumentsResponse> => {
  const { file, projectId } = params;
  const uploadTargetResponse = (await generateFileUploadUrl({
    body: {
      type: 'erwiderungs_import',
      projectId,
      filename: file.name,
      createNewVersion: true,
    },
  })) as ClientResult<UploadUrlResponse>;
  const { data: uploadTarget, error: uploadTargetError } = uploadTargetResponse;

  if (uploadTargetError) {
    throw new Error(
      getImportErrorMessage(
        uploadTargetError,
        'Erwiderung import upload URL request failed.',
      ),
    );
  }

  if (!uploadTarget) {
    throw new Error('Erwiderung import upload URL response is empty.');
  }

  await uploadFileToStorage({
    file,
    mimeType: uploadTarget.mimeType,
    uploadUrl: uploadTarget.uploadUrl,
  });

  const confirmUploadResponse = (await confirmFileUpload({
    body: {
      type: 'erwiderungs_import',
      projectId,
      filename: file.name,
      createNewVersion: true,
    },
  })) as ClientResult<ConfirmFileUploadResponse>;
  const { data: confirmedUpload, error: confirmUploadError } =
    confirmUploadResponse;

  if (confirmUploadError) {
    throw new Error(
      getImportErrorMessage(
        confirmUploadError,
        'Erwiderung import confirm upload request failed.',
      ),
    );
  }

  if (!confirmedUpload) {
    throw new Error('Erwiderung import confirm upload response is empty.');
  }

  const fileId = getConfirmedFileId(confirmedUpload);
  await waitForErwiderungImportScan(
    await startErwiderungImportScan({ fileId, projectId }),
  );

  const importResponse = (await importObjectionsArguments({
    path: {
      projectId: projectId,
    },
    body: {
      fileId: fileId,
    },
  })) as ClientResult<ImportObjectionsArgumentsResponse>;
  const { data: importResult, error: importError } = importResponse;

  if (importError) {
    throw new Error(
      getImportErrorMessage(importError, 'Erwiderung import request failed.'),
    );
  }

  if (!importResult) {
    throw new Error('Erwiderung import response is empty.');
  }

  return importResult;
};
