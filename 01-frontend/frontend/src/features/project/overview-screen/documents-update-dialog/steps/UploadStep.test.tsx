import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadErrorDetails } from '../DocumentsUploadContext.types';
import { UploadStep } from './UploadStep';

const mocks = vi.hoisted(() => ({
  context: {
    addFiles: vi.fn(),
    close: () => undefined,
    files: [],
    globalError: null as string | null,
    uploadErrorDetails: null as UploadErrorDetails | null,
    isUploading: false,
    startUpload: () => undefined,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../dialog-content/DialogShell', () => ({
  DialogShell: (props: {
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div>
      {props.children}
      {props.footer}
    </div>
  ),
}));

vi.mock('../DocumentsUploadContext', () => ({
  useDocumentsUploadContext: () => mocks.context,
}));

describe('UploadStep', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.context.addFiles.mockReset();
    mocks.context.globalError = null;
    mocks.context.uploadErrorDetails = null;
  });

  it('limits the native file picker to ZIP files', () => {
    const { container } = render(<UploadStep />);
    const input = container.querySelector('input[type="file"]');

    expect(input?.getAttribute('accept')).toBe('.zip');
    expect(input?.hasAttribute('multiple')).toBe(false);
  });

  it('blocks a multi-file drag and drop while still accepting one ZIP', () => {
    render(<UploadStep />);
    const target = screen.getByText(
      'Documents.updateDocuments.upload.dropzoneTitle',
    );
    const files = [new File(['a'], 'a.zip'), new File(['b'], 'b.zip')];
    const dataTransfer = {
      items: files.map(() => ({ kind: 'file' })),
      files,
      dropEffect: 'copy',
    };

    fireEvent.dragOver(target, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('none');
    expect(screen.getByRole('alert').textContent).toBe(
      'Documents.updateDocuments.upload.errors.singleZipRequired',
    );
    fireEvent.drop(target, { dataTransfer });
    expect(mocks.context.addFiles).not.toHaveBeenCalled();

    const singleZip = new File(['zip'], 'docs.zip');
    fireEvent.dragOver(target, {
      dataTransfer: { items: [{ kind: 'file' }], dropEffect: 'none' },
    });
    fireEvent.drop(target, { dataTransfer: { files: [singleZip] } });
    expect(mocks.context.addFiles).toHaveBeenCalledWith([singleZip]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the reason for a failed ZIP with a known failure code', () => {
    mocks.context.globalError = 'processing-failed';
    mocks.context.uploadErrorDetails = {
      kind: 'processing-failed',
      workflowFailureCode: 'ZIP_ENCRYPTED',
    };

    render(<UploadStep />);

    expect(screen.getByRole('alert').textContent).toBe(
      'Documents.processingFailureReasons.ZIP_ENCRYPTED',
    );
  });

  it('shows the generic processing error without a failure code', () => {
    mocks.context.globalError = 'processing-failed';
    mocks.context.uploadErrorDetails = {
      kind: 'processing-failed',
      workflowFailureCode: null,
    };

    render(<UploadStep />);

    expect(screen.getByRole('alert').textContent).toBe(
      'Documents.updateDocuments.upload.errors.processingFailed',
    );
  });
});
