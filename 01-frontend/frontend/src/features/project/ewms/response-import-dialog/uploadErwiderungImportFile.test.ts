import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadErwiderungImportFile } from './uploadErwiderungImportFile';

const mocks = vi.hoisted(() => ({
  confirmUpload: vi.fn(),
  generateUploadUrl: vi.fn(),
  getWorkflow: vi.fn(),
  importArguments: vi.fn(),
  startFileProcessing: vi.fn(),
  uploadFileToStorage: vi.fn(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1DocumentManagementConfirmFileUpload: mocks.confirmUpload,
  v1DocumentManagementGenerateFileUploadUrl: mocks.generateUploadUrl,
  v1DocumentManagementStartFileProcessing: mocks.startFileProcessing,
  v1ObjectionsManagementImportObjectionsArguments: mocks.importArguments,
  v1TemporalJobsGetTemporalWorkflow: mocks.getWorkflow,
}));

vi.mock('@/features/shared/remote-files/uploadFileToStorage', () => ({
  uploadFileToStorage: mocks.uploadFileToStorage,
}));

const confirmedImportUpload = {
  bucketPath: 'erwiderungen/import.csv',
  createdAt: '2026-06-10T00:00:00.000Z',
  filename: 'import.csv',
  id: 'file-1',
  isDeleted: false,
  mimeType: 'text/csv',
  projectId: 'project-1',
  projectVersion: 1,
  topics: [],
  type: 'erwiderungs_import',
  updatedAt: '2026-06-10T00:00:00.000Z',
  version: 1,
};

const importResult = {
  imported: 2,
  skipped: 0,
};

describe('uploadErwiderungImportFile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.confirmUpload.mockReset();
    mocks.generateUploadUrl.mockReset();
    mocks.getWorkflow.mockReset();
    mocks.importArguments.mockReset();
    mocks.startFileProcessing.mockReset();
    mocks.uploadFileToStorage.mockReset();

    mocks.generateUploadUrl.mockResolvedValue({
      data: {
        mimeType: 'text/csv',
        uploadUrl: 'https://storage.example/upload',
      },
    });
    mocks.uploadFileToStorage.mockResolvedValue(undefined);
    mocks.confirmUpload.mockResolvedValue({
      data: confirmedImportUpload,
    });
    mocks.startFileProcessing.mockResolvedValue({
      data: {
        runId: 'run-1',
        workflowId: 'workflow-1',
        workflowStatus: 'RUNNING',
      },
    });
    mocks.importArguments.mockResolvedValue({
      data: importResult,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the scan workflow before starting the OMS import', async () => {
    mocks.getWorkflow
      .mockResolvedValueOnce({
        data: {
          result: null,
          status: 'running',
          workflowId: 'workflow-1',
          workflowType: 'SingleFileProcessingWorkflow',
        },
      })
      .mockResolvedValueOnce({
        data: {
          result: null,
          status: 'completed',
          workflowId: 'workflow-1',
          workflowType: 'SingleFileProcessingWorkflow',
        },
      });

    const uploadPromise = uploadErwiderungImportFile({
      file: new File(['csv'], 'import.csv', { type: 'text/csv' }),
      projectId: 'project-1',
    });

    await vi.waitFor(() => expect(mocks.getWorkflow).toHaveBeenCalledOnce());
    expect(mocks.importArguments).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    await expect(uploadPromise).resolves.toEqual(importResult);
    expect(mocks.getWorkflow).toHaveBeenCalledTimes(2);
    expect(mocks.importArguments).toHaveBeenCalledWith({
      body: {
        fileId: 'file-1',
      },
      path: {
        projectId: 'project-1',
      },
    });
  });

  it('starts the OMS import without Temporal polling when DMS reports completed processing', async () => {
    mocks.startFileProcessing.mockResolvedValue({
      data: {
        runId: '',
        workflowId: 'file-1',
        workflowStatus: 'COMPLETED',
      },
    });

    await expect(
      uploadErwiderungImportFile({
        file: new File(['csv'], 'import.csv', { type: 'text/csv' }),
        projectId: 'project-1',
      }),
    ).resolves.toEqual(importResult);

    expect(mocks.getWorkflow).not.toHaveBeenCalled();
    expect(mocks.startFileProcessing).toHaveBeenCalledWith({
      body: {
        fileId: 'file-1',
        projectId: 'project-1',
      },
    });
    expect(mocks.importArguments).toHaveBeenCalledWith({
      body: {
        fileId: 'file-1',
      },
      path: {
        projectId: 'project-1',
      },
    });
  });

  it('does not start the OMS import when the scan workflow fails', async () => {
    mocks.getWorkflow.mockResolvedValueOnce({
      data: {
        result: null,
        status: 'failed',
        workflowId: 'workflow-1',
        workflowType: 'SingleFileProcessingWorkflow',
      },
    });

    await expect(
      uploadErwiderungImportFile({
        file: new File(['csv'], 'import.csv', { type: 'text/csv' }),
        projectId: 'project-1',
      }),
    ).rejects.toThrow(
      'Erwiderung import scan workflow ended with status failed.',
    );

    expect(mocks.importArguments).not.toHaveBeenCalled();
  });
});
