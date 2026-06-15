import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lookupOpenWorkflow,
  resolveOpenWorkflow,
  runStartUpload,
  type StartUploadDeps,
} from './uploadWorkflow.helpers';
import type { UploadFile } from './DocumentsUploadContext.types';
import type { UploadZipResult } from './dialog-logic/useZipUpload';

const mocks = vi.hoisted(() => ({
  listZipFiles: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/api-clients/dms-module', () => ({
  listZipFilesV2ZipFilesGet: mocks.listZipFiles,
}));

vi.mock(
  '@/features/project/data/file-processing/useProcessingFilesQuery',
  () => ({
    isActiveWorkflowStatus: (status: string) =>
      status === 'PENDING' || status === 'RUNNING',
    isActiveZipApprovalStatus: (status: string | null | undefined) =>
      status === 'APPROVING',
  }),
);

vi.mock('@sentry/react', () => ({
  captureException: mocks.captureException,
}));

const zipFile = (overrides: Partial<UploadFile> = {}): UploadFile => ({
  id: 'file-1',
  file: new File(['x'], 'docs.zip', { type: 'application/zip' }),
  status: 'queued',
  ...overrides,
});

const makeDeps = (
  overrides: Partial<StartUploadDeps> = {},
): StartUploadDeps => {
  const baseUploadZip = vi
    .fn<StartUploadDeps['uploadZip']>()
    .mockResolvedValue({ kind: 'success', zipFileId: 'zip-uploaded' });
  return {
    projectId: 'project-1',
    projectVersion: 4,
    canMutateProject: true,
    files: [zipFile()],
    uploadZip: baseUploadZip,
    markFileAsUploadFailed: vi.fn(),
    setPhase: vi.fn(),
    setZipFileId: vi.fn(),
    setGlobalError: vi.fn(),
    setUploadErrorDetails: vi.fn(),
    ...overrides,
  };
};

describe('lookupOpenWorkflow', () => {
  beforeEach(() => {
    mocks.listZipFiles.mockReset();
  });

  it('returns null when the project has no open or pending workflows', async () => {
    mocks.listZipFiles.mockResolvedValue({
      data: [{ id: 'a', workflowStatus: 'COMPLETED' }],
    });

    await expect(lookupOpenWorkflow('project-1', 4)).resolves.toBeNull();
    expect(mocks.listZipFiles).toHaveBeenCalledWith({
      query: { projectId: 'project-1', project_version: 4 },
      throwOnError: true,
    });
  });

  it('routes to the diff phase when a workflow is REQUIRES_APPROVAL so the user resumes review', async () => {
    mocks.listZipFiles.mockResolvedValue({
      data: [
        { id: 'old', workflowStatus: 'COMPLETED' },
        { id: 'pending', workflowStatus: 'REQUIRES_APPROVAL' },
      ],
    });

    await expect(lookupOpenWorkflow('project-1', 4)).resolves.toEqual({
      phase: 'diff',
      zipFileId: 'pending',
    });
  });

  it('prefers REQUIRES_APPROVAL over active workflows when both exist', async () => {
    mocks.listZipFiles.mockResolvedValue({
      data: [
        { id: 'running', workflowStatus: 'RUNNING' },
        { id: 'pending', workflowStatus: 'REQUIRES_APPROVAL' },
      ],
    });

    await expect(lookupOpenWorkflow('project-1', 4)).resolves.toMatchObject({
      phase: 'diff',
      zipFileId: 'pending',
    });
  });

  it('routes to the uploading phase when only an active workflow exists', async () => {
    mocks.listZipFiles.mockResolvedValue({
      data: [{ id: 'running', workflowStatus: 'PENDING' }],
    });

    await expect(lookupOpenWorkflow('project-1', 4)).resolves.toEqual({
      phase: 'uploading',
      zipFileId: 'running',
    });
  });

  it('returns null for an empty payload', async () => {
    mocks.listZipFiles.mockResolvedValue({ data: [] });

    await expect(lookupOpenWorkflow('project-1', 4)).resolves.toBeNull();
  });
});

describe('resolveOpenWorkflow', () => {
  it('routes to the diff phase when a zip exposes approvalStatus REQUIRES_APPROVAL', () => {
    expect(
      resolveOpenWorkflow([
        { id: 'running', workflowStatus: 'RUNNING' },
        {
          id: 'pending-approval',
          workflowStatus: 'COMPLETED',
          approvalStatus: 'REQUIRES_APPROVAL',
        },
      ]),
    ).toEqual({
      phase: 'diff',
      zipFileId: 'pending-approval',
    });
  });

  it('routes to the approval-initializing phase when a zip is approving', () => {
    expect(
      resolveOpenWorkflow([
        {
          id: 'approval-running',
          workflowStatus: 'COMPLETED',
          approvalStatus: 'APPROVING',
        },
      ]),
    ).toEqual({
      phase: 'approval-initializing',
      zipFileId: 'approval-running',
    });
  });

  it('returns an active upload only when no approval workflow is pending', () => {
    expect(
      resolveOpenWorkflow([{ id: 'running', workflowStatus: 'RUNNING' }]),
    ).toEqual({
      phase: 'uploading',
      zipFileId: 'running',
    });
  });

  it('ignores EWMS ZIP workflows when resolving project document uploads', () => {
    expect(
      resolveOpenWorkflow([
        {
          id: 'ewms-running',
          type: 'ewms_zip',
          workflowStatus: 'RUNNING',
        },
        {
          id: 'project-running',
          type: 'zip',
          workflowStatus: 'RUNNING',
        },
      ]),
    ).toEqual({
      phase: 'uploading',
      zipFileId: 'project-running',
    });
  });
});

describe('runStartUpload', () => {
  beforeEach(() => {
    mocks.listZipFiles.mockReset();
    mocks.captureException.mockReset();
  });

  it('is a no-op when projectId is null', async () => {
    const deps = makeDeps({ projectId: null });
    await runStartUpload(deps)();
    expect(deps.uploadZip).not.toHaveBeenCalled();
    expect(deps.setPhase).not.toHaveBeenCalled();
  });

  it('fails closed and reports to Sentry when the caller cannot mutate the project', async () => {
    const deps = makeDeps({ canMutateProject: false });
    await runStartUpload(deps)();
    expect(deps.uploadZip).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  it('surfaces a `zip-required` error when no queued zip is present', async () => {
    const nonZip = zipFile({
      id: 'pdf',
      file: new File(['x'], 'docs.pdf'),
    });
    const deps = makeDeps({ files: [nonZip] });
    await runStartUpload(deps)();
    expect(deps.setGlobalError).toHaveBeenCalledWith('zip-required');
    expect(deps.uploadZip).not.toHaveBeenCalled();
  });

  it('ignores already-failed files when picking the upload candidate', async () => {
    const failed = zipFile({ id: 'old', status: 'error' });
    const deps = makeDeps({ files: [failed] });
    await runStartUpload(deps)();
    expect(deps.setGlobalError).toHaveBeenCalledWith('zip-required');
    expect(deps.uploadZip).not.toHaveBeenCalled();
  });

  it('transitions to uploading and stores the zipFileId on success', async () => {
    const deps = makeDeps();
    await runStartUpload(deps)();
    expect(deps.setPhase).toHaveBeenCalledWith('uploading');
    expect(deps.setZipFileId).toHaveBeenCalledWith('zip-uploaded');
    expect(deps.setGlobalError).toHaveBeenCalledWith(null);
  });

  it('recovers from a 409 confirm conflict by adopting the existing open workflow', async () => {
    const conflictResult: UploadZipResult = {
      kind: 'error',
      stage: 'confirm',
      error: new Error('conflict'),
      httpStatus: 409,
    };
    const deps = makeDeps({
      uploadZip: vi.fn().mockResolvedValue(conflictResult),
    });
    mocks.listZipFiles.mockResolvedValue({
      data: [{ id: 'recovered', workflowStatus: 'REQUIRES_APPROVAL' }],
    });

    await runStartUpload(deps)();

    expect(deps.setPhase).toHaveBeenLastCalledWith('diff');
    expect(deps.setZipFileId).toHaveBeenLastCalledWith('recovered');
    expect(deps.setGlobalError).not.toHaveBeenCalledWith('upload-failed');
    expect(deps.markFileAsUploadFailed).not.toHaveBeenCalled();
  });

  it('recovers from a 409 start-processing conflict', async () => {
    const conflictResult: UploadZipResult = {
      kind: 'error',
      stage: 'start-processing',
      error: new Error('conflict'),
      httpStatus: 409,
    };
    const deps = makeDeps({
      uploadZip: vi.fn().mockResolvedValue(conflictResult),
    });
    mocks.listZipFiles.mockResolvedValue({
      data: [{ id: 'recovered', workflowStatus: 'RUNNING' }],
    });

    await runStartUpload(deps)();

    expect(deps.setPhase).toHaveBeenLastCalledWith('uploading');
    expect(deps.setZipFileId).toHaveBeenLastCalledWith('recovered');
  });

  it('falls through to the generic upload-failed path when 409 recovery finds no workflow', async () => {
    const conflictResult: UploadZipResult = {
      kind: 'error',
      stage: 'confirm',
      error: new Error('conflict'),
      httpStatus: 409,
    };
    const deps = makeDeps({
      uploadZip: vi.fn().mockResolvedValue(conflictResult),
    });
    mocks.listZipFiles.mockResolvedValue({ data: [] });

    await runStartUpload(deps)();

    expect(deps.setPhase).toHaveBeenLastCalledWith('selecting');
    expect(deps.setGlobalError).toHaveBeenLastCalledWith('upload-failed');
    expect(deps.markFileAsUploadFailed).toHaveBeenCalledWith('file-1');
  });

  it('marks the file as failed and surfaces upload-failed for non-recoverable errors', async () => {
    const errorResult: UploadZipResult = {
      kind: 'error',
      stage: 'storage-put',
      error: new Error('boom'),
      httpStatus: 502,
    };
    const deps = makeDeps({
      uploadZip: vi.fn().mockResolvedValue(errorResult),
    });

    await runStartUpload(deps)();

    expect(deps.markFileAsUploadFailed).toHaveBeenCalledWith('file-1');
    expect(deps.setPhase).toHaveBeenLastCalledWith('selecting');
    expect(deps.setGlobalError).toHaveBeenLastCalledWith('upload-failed');
    expect(deps.setUploadErrorDetails).toHaveBeenLastCalledWith({
      kind: 'upload-failed',
      stage: 'storage-put',
      error: errorResult.error,
    });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  it('does not attempt 409 recovery for non-confirm/non-start-processing stages', async () => {
    const errorResult: UploadZipResult = {
      kind: 'error',
      stage: 'storage-put',
      error: new Error('boom'),
      httpStatus: 409,
    };
    const deps = makeDeps({
      uploadZip: vi.fn().mockResolvedValue(errorResult),
    });

    await runStartUpload(deps)();

    expect(mocks.listZipFiles).not.toHaveBeenCalled();
    expect(deps.setGlobalError).toHaveBeenLastCalledWith('upload-failed');
  });

  it('captures listZipFiles failure during conflict recovery to Sentry and falls back gracefully', async () => {
    const conflictResult: UploadZipResult = {
      kind: 'error',
      stage: 'confirm',
      error: new Error('conflict'),
      httpStatus: 409,
    };
    const deps = makeDeps({
      uploadZip: vi.fn().mockResolvedValue(conflictResult),
    });
    mocks.listZipFiles.mockRejectedValue(new Error('preflight network'));

    await runStartUpload(deps)();

    expect(mocks.captureException).toHaveBeenCalled();
    expect(deps.setPhase).toHaveBeenLastCalledWith('selecting');
    expect(deps.setGlobalError).toHaveBeenLastCalledWith('upload-failed');
  });
});
