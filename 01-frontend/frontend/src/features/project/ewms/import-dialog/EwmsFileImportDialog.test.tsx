import { resetProjectPermissionTestMocks } from '@/features/project/test/projectPermissionTestMocks';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EwmsFileImportDialog } from './EwmsFileImportDialog';

const mocks = vi.hoisted(() => ({
  systemLoad: {
    disableThresholdPercentage: 500,
    isError: false,
    isLoading: false,
    isSystemLoadHigh: false,
  },
  uploadEwmsZip: vi.fn(),
}));

vi.mock('@/features/workflow-runtime/system-load/useSystemLoad', () => ({
  useSystemLoad: () => mocks.systemLoad,
}));

vi.mock('@/features/ui/dialog/Dialog', () => ({
  Dialog: (props: {
    children: ReactNode;
    onOpenChange: (open: boolean) => void;
    open: boolean;
  }) => (props.open ? <div>{props.children}</div> : null),
  DialogContent: (props: { children: ReactNode }) => (
    <div>{props.children}</div>
  ),
  DialogDescription: (props: { children: ReactNode }) => (
    <p>{props.children}</p>
  ),
  DialogHeader: (props: { children: ReactNode }) => <div>{props.children}</div>,
  DialogTitle: (props: { children: ReactNode }) => <h2>{props.children}</h2>,
}));

vi.mock('./FileImportProgressStep', () => ({
  FileImportProgressStep: () => <div>importing</div>,
}));

vi.mock('./FileReviewStep', () => ({
  FileReviewStep: (props: { onClose: () => void }) => (
    <div>
      <button type="button" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
}));

vi.mock('./FileUploadStep', () => ({
  FileUploadStep: (props: {
    onFileSelect: (file: File | undefined) => void;
    onSubmit: () => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          props.onFileSelect(
            new File(['zip'], 'ewms.zip', { type: 'application/zip' }),
          )
        }
      >
        select
      </button>
      <button type="button" onClick={props.onSubmit}>
        upload
      </button>
    </div>
  ),
  isZipFile: (file: File) => file.name.endsWith('.zip'),
}));

vi.mock('./uploadEwmsZip', () => ({
  uploadEwmsZip: mocks.uploadEwmsZip,
}));

describe('EwmsFileImportDialog', () => {
  beforeEach(() => {
    resetProjectPermissionTestMocks();
    mocks.systemLoad = {
      disableThresholdPercentage: 500,
      isError: false,
      isLoading: false,
      isSystemLoadHigh: false,
    };
    mocks.uploadEwmsZip.mockReset();
    mocks.uploadEwmsZip.mockResolvedValue({
      completedUpload: {
        id: 'zip-1',
        filename: 'ewms.zip',
        type: 'ewms_zip',
        bucketPath: 'ewms/ewms.zip',
        projectId: 'project-1',
        workflowStatus: 'COMPLETED',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      },
      fileReview: {
        failed: [],
        successful: [],
      },
      processingWorkflowId: 'EWMSOrchestratorWorkflow-project-1',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('uploads the ZIP without starting analysis from the frontend', async () => {
    const onOpenChange = vi.fn();
    const onProcessingStarted = vi.fn();
    const onUploadStarted = vi.fn();
    const onUploaded = vi.fn();

    render(
      <EwmsFileImportDialog
        open
        projectId="project-1"
        onOpenChange={onOpenChange}
        onProcessingStarted={onProcessingStarted}
        onUploadStarted={onUploadStarted}
        onUploaded={onUploaded}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'select' }));
    fireEvent.click(screen.getByRole('button', { name: 'upload' }));

    await screen.findByRole('button', { name: 'close' });

    expect(onUploadStarted).toHaveBeenCalledTimes(1);
    expect(mocks.uploadEwmsZip).toHaveBeenCalledTimes(1);
    expect(mocks.uploadEwmsZip).toHaveBeenCalledWith({
      file: expect.any(File),
      onProcessingStarted,
      projectId: 'project-1',
    });
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('button', { name: 'upload' })).toBeNull();
    expect(screen.getByRole('button', { name: 'close' })).not.toBeNull();
  });

  it('guards the initial upload step when system load is too high', () => {
    mocks.systemLoad = {
      disableThresholdPercentage: 500,
      isError: false,
      isLoading: false,
      isSystemLoadHigh: true,
    };

    render(
      <EwmsFileImportDialog
        open
        projectId="project-1"
        onOpenChange={() => undefined}
        onUploaded={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'select' }));
    fireEvent.click(screen.getByRole('button', { name: 'upload' }));

    expect(mocks.uploadEwmsZip).not.toHaveBeenCalled();
  });
});
