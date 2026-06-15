import {
  confirmUploadV2FilesConfirmUploadPost,
  generateUploadUrlV2FilesGenerateUploadUrlPost,
  getZipFileV2ZipFilesZipFileIdGet,
  startFileProcessingV2FilesStartFileProcessingPost,
  type ConfirmUploadV2FilesConfirmUploadPostResponse,
  type FileUploadUrlResponse,
  type StartFileProcessingResponse,
  type WorkflowStatusEnum,
  type ZipFileResponse,
} from '@/api-clients/dms-module';
import { uploadFileToStorage } from '@/features/shared/remote-files/uploadFileToStorage';
import {
  COMPLETED_TEMPORAL_WORKFLOW_STATUS,
  FAILED_TEMPORAL_WORKFLOW_STATUSES,
  loadTemporalWorkflow,
  sleep,
} from '../data/temporalWorkflowPolling';
import {
  parseEwmsFileReviewResult,
  type EwmsFileReviewResult,
} from './ewmsFileReviewResult';

const ZIP_WORKFLOW_POLL_INTERVAL_MS = 3000;
const FILE_REVIEW_RESULT_POLL_INTERVAL_MS = 1000;
const FILE_REVIEW_RESULT_MAX_POLLS = 30;
const PROCESSING_WORKFLOW_STATUSES: WorkflowStatusEnum[] = [
  'PENDING',
  'RUNNING',
  'CONTINUED_AS_NEW',
];
const FAILED_WORKFLOW_STATUSES: WorkflowStatusEnum[] = [
  'FAILED',
  'CANCELED',
  'TERMINATED',
  'TIMED_OUT',
];
const COMPLETED_WORKFLOW_STATUS: WorkflowStatusEnum = 'COMPLETED';

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

const getUploadErrorMessage = (error: unknown, fallback: string) => {
  if (hasStringDetail(error)) {
    return error.detail;
  }

  if (hasMessage(error)) {
    return error.message;
  }

  return fallback;
};

type ClientResult<TData> = {
  data?: TData;
  error?: unknown;
};

const isZipFileResponse = (
  response: ConfirmUploadV2FilesConfirmUploadPostResponse,
): response is ZipFileResponse => 'workflowStatus' in response;

export type EwmsZipUploadResult = {
  completedUpload: ZipFileResponse;
  fileReview: EwmsFileReviewResult;
  processingWorkflowId: string;
};

export type EwmsZipProcessingWorkflow = StartFileProcessingResponse;

const startEwmsZipProcessing = async (params: {
  fileId: string;
  projectId: string;
}): Promise<StartFileProcessingResponse> => {
  const { fileId, projectId } = params;
  const processingResponse =
    (await startFileProcessingV2FilesStartFileProcessingPost({
      body: {
        fileId,
        projectId,
      },
    })) as ClientResult<StartFileProcessingResponse>;

  if (processingResponse.error) {
    throw new Error(
      getUploadErrorMessage(
        processingResponse.error,
        'EWMS ZIP processing could not be started.',
      ),
    );
  }

  if (!processingResponse.data) {
    throw new Error('EWMS ZIP processing response is empty.');
  }

  return processingResponse.data;
};

const parseLoadedEwmsFileReviewResult = (
  workflow: Awaited<ReturnType<typeof loadTemporalWorkflow>>,
): EwmsFileReviewResult | null => {
  if (workflow.result === undefined || workflow.result === null) {
    return null;
  }

  try {
    return parseEwmsFileReviewResult(workflow.result);
  } catch {
    throw new Error('EWMS file review result is invalid.');
  }
};

/**
 * Polls Temporal until the completed ZIP workflow exposes its file review result.
 */
const loadEwmsFileReviewResult = async (
  workflowId: string,
): Promise<EwmsFileReviewResult> => {
  let latestWorkflow: Awaited<ReturnType<typeof loadTemporalWorkflow>> | null =
    null;

  for (
    let pollCount = 0;
    pollCount < FILE_REVIEW_RESULT_MAX_POLLS;
    pollCount += 1
  ) {
    if (pollCount > 0) {
      // eslint-disable-next-line no-await-in-loop -- each retry waits for Temporal to expose the completed workflow result.
      await sleep(FILE_REVIEW_RESULT_POLL_INTERVAL_MS);
    }

    // eslint-disable-next-line no-await-in-loop -- each request depends on the previous workflow detail result before deciding whether to continue.
    latestWorkflow = await loadTemporalWorkflow({
      emptyResponseMessage: 'EWMS file review result response is empty.',
      getErrorMessage: getUploadErrorMessage,
      requestFailedFallback: 'EWMS file review result request failed.',
      workflowId,
    });
    const fileReview = parseLoadedEwmsFileReviewResult(latestWorkflow);

    if (fileReview !== null) {
      return fileReview;
    }

    if (FAILED_TEMPORAL_WORKFLOW_STATUSES.includes(latestWorkflow.status)) {
      throw new Error(
        `EWMS file review workflow ended with status ${latestWorkflow.status}.`,
      );
    }
  }

  if (latestWorkflow?.status === COMPLETED_TEMPORAL_WORKFLOW_STATUS) {
    throw new Error('EWMS file review result is empty.');
  }

  throw new Error('EWMS file review result is not available.');
};

/**
 * Polls the ZIP workflow until the backend reports a terminal processing state.
 */
const pollEwmsZipWorkflow = async (
  confirmedUpload: ZipFileResponse,
): Promise<ZipFileResponse> => {
  let latestZipFile = confirmedUpload;

  while (PROCESSING_WORKFLOW_STATUSES.includes(latestZipFile.workflowStatus)) {
    // eslint-disable-next-line no-await-in-loop -- each poll delay depends on the previous workflow status before deciding whether to continue.
    await sleep(ZIP_WORKFLOW_POLL_INTERVAL_MS);

    // eslint-disable-next-line no-await-in-loop -- each request depends on the previous workflow status before deciding whether to continue.
    const zipFileResponse = (await getZipFileV2ZipFilesZipFileIdGet({
      path: {
        zip_file_id: confirmedUpload.id,
      },
    })) as ClientResult<ZipFileResponse>;

    if (zipFileResponse.error) {
      throw new Error(
        getUploadErrorMessage(
          zipFileResponse.error,
          'EWMS ZIP workflow status request failed.',
        ),
      );
    }

    if (!zipFileResponse.data) {
      throw new Error('EWMS ZIP workflow status response is empty.');
    }

    latestZipFile = zipFileResponse.data;
  }

  if (latestZipFile.workflowStatus === COMPLETED_WORKFLOW_STATUS) {
    return latestZipFile;
  }

  if (FAILED_WORKFLOW_STATUSES.includes(latestZipFile.workflowStatus)) {
    throw new Error(
      `EWMS ZIP workflow ended with status ${latestZipFile.workflowStatus}.`,
    );
  }

  throw new Error(
    `EWMS ZIP workflow ended with unsupported status ${latestZipFile.workflowStatus}.`,
  );
};

/**
 * Uploads one EWMS ZIP through the DMS upload handshake.
 */
export const uploadEwmsZip = async (params: {
  file: File;
  onProcessingStarted?: (
    processingWorkflow: EwmsZipProcessingWorkflow,
  ) => Promise<void> | void;
  projectId: string;
}): Promise<EwmsZipUploadResult> => {
  const { file, onProcessingStarted, projectId } = params;
  const uploadTargetResponse =
    (await generateUploadUrlV2FilesGenerateUploadUrlPost({
      body: {
        type: 'ewms_zip',
        projectId,
        filename: file.name,
      },
    })) as ClientResult<FileUploadUrlResponse>;
  const { data: uploadTarget, error: uploadTargetError } = uploadTargetResponse;

  if (uploadTargetError) {
    throw new Error(
      getUploadErrorMessage(
        uploadTargetError,
        'EWMS ZIP upload URL request failed.',
      ),
    );
  }

  if (!uploadTarget) {
    throw new Error('EWMS ZIP upload URL response is empty.');
  }

  await uploadFileToStorage({
    file,
    mimeType: uploadTarget.mimeType,
    uploadUrl: uploadTarget.uploadUrl,
  });

  const confirmUploadResponse = (await confirmUploadV2FilesConfirmUploadPost({
    body: {
      type: 'ewms_zip',
      projectId,
      filename: file.name,
    },
  })) as ClientResult<ConfirmUploadV2FilesConfirmUploadPostResponse>;
  const { data: confirmedUpload, error: confirmUploadError } =
    confirmUploadResponse;

  if (confirmUploadError) {
    throw new Error(
      getUploadErrorMessage(
        confirmUploadError,
        'EWMS ZIP confirm upload request failed.',
      ),
    );
  }

  if (!confirmedUpload) {
    throw new Error('EWMS ZIP confirm upload response is empty.');
  }

  if (!isZipFileResponse(confirmedUpload)) {
    throw new Error('EWMS ZIP confirm upload did not return a ZIP file.');
  }

  const processingWorkflow = await startEwmsZipProcessing({
    fileId: confirmedUpload.id,
    projectId,
  });
  await onProcessingStarted?.(processingWorkflow);

  const completedUpload = await pollEwmsZipWorkflow(confirmedUpload);
  const fileReview = await loadEwmsFileReviewResult(
    processingWorkflow.workflowId,
  );

  return {
    completedUpload,
    fileReview,
    processingWorkflowId: processingWorkflow.workflowId,
  };
};
