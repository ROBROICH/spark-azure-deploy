import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadEwmsZip } from './uploadEwmsZip';

const mocks = vi.hoisted(() => ({
  confirmUpload: vi.fn(),
  generateUploadUrl: vi.fn(),
  getWorkflow: vi.fn(),
  getZipFile: vi.fn(),
  startFileProcessing: vi.fn(),
  uploadFileToStorage: vi.fn(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1DocumentManagementConfirmFileUpload: mocks.confirmUpload,
  v1DocumentManagementGenerateFileUploadUrl: mocks.generateUploadUrl,
  v1DocumentManagementGetZipFile: mocks.getZipFile,
  v1DocumentManagementStartFileProcessing: mocks.startFileProcessing,
  v1TemporalJobsGetTemporalWorkflow: mocks.getWorkflow,
}));

vi.mock('@/features/shared/remote-files/uploadFileToStorage', () => ({
  uploadFileToStorage: mocks.uploadFileToStorage,
}));

const completedZipUpload = {
  bucketPath: 'zips/ewms.zip',
  createdAt: '2026-05-21T00:00:00.000Z',
  filename: 'ewms.zip',
  id: 'zip-1',
  projectId: 'project-1',
  type: 'ewms_zip',
  updatedAt: '2026-05-21T00:00:00.000Z',
  workflowStatus: 'COMPLETED',
};

const successfulFileReviewResult = {
  failed: [],
  successful: [
    {
      action: 'INGEST',
      fileId: 'file-1',
      filename: 'E1234.pdf',
    },
  ],
  summary: {
    failed: 0,
    succeeded: 1,
    total: 1,
  },
  status: 'APPROVED',
};

describe('uploadEwmsZip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.confirmUpload.mockReset();
    mocks.generateUploadUrl.mockReset();
    mocks.getWorkflow.mockReset();
    mocks.getZipFile.mockReset();
    mocks.startFileProcessing.mockReset();
    mocks.uploadFileToStorage.mockReset();

    mocks.generateUploadUrl.mockResolvedValue({
      data: {
        mimeType: 'application/zip',
        uploadUrl: 'https://storage.example/upload',
      },
    });
    mocks.uploadFileToStorage.mockResolvedValue(undefined);
    mocks.confirmUpload.mockResolvedValue({
      data: completedZipUpload,
    });
    mocks.startFileProcessing.mockResolvedValue({
      data: {
        runId: 'run-1',
        workflowId: 'workflow-1',
        workflowStatus: 'RUNNING',
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for Temporal to expose the file review result after the ZIP is completed', async () => {
    const onProcessingStarted = vi.fn();
    mocks.getWorkflow
      .mockResolvedValueOnce({
        data: {
          result: null,
          status: 'completed',
          workflowId: 'workflow-1',
          workflowType: 'FileProcessingWorkflow',
        },
      })
      .mockResolvedValueOnce({
        data: {
          result: successfulFileReviewResult,
          status: 'completed',
          workflowId: 'workflow-1',
          workflowType: 'FileProcessingWorkflow',
        },
      });

    const uploadPromise = uploadEwmsZip({
      file: new File(['zip'], 'ewms.zip', { type: 'application/zip' }),
      onProcessingStarted,
      projectId: 'project-1',
    });

    await vi.waitFor(() => expect(onProcessingStarted).toHaveBeenCalledOnce());
    expect(onProcessingStarted).toHaveBeenCalledWith({
      runId: 'run-1',
      workflowId: 'workflow-1',
      workflowStatus: 'RUNNING',
    });
    await vi.waitFor(() => expect(mocks.getWorkflow).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(1000);

    await expect(uploadPromise).resolves.toEqual({
      completedUpload: completedZipUpload,
      fileReview: successfulFileReviewResult,
      processingWorkflowId: 'workflow-1',
    });
    expect(mocks.getWorkflow).toHaveBeenCalledTimes(2);
  });

  it('fails immediately when Temporal returns an invalid file review result', async () => {
    mocks.getWorkflow.mockResolvedValue({
      data: {
        result: {
          failed: [],
          successful: [{ fileId: null, filename: 'E1234.pdf' }],
        },
        status: 'completed',
        workflowId: 'workflow-1',
        workflowType: 'FileProcessingWorkflow',
      },
    });

    const uploadPromise = uploadEwmsZip({
      file: new File(['zip'], 'ewms.zip', { type: 'application/zip' }),
      projectId: 'project-1',
    });

    await expect(uploadPromise).rejects.toThrow(
      'EWMS file review result is invalid',
    );
    expect(mocks.getWorkflow).toHaveBeenCalledOnce();
  });
});
