import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinalizeProcedureDialog } from './FinalizeProcedureDialog';

const mocks = vi.hoisted(() => ({
  downloadFinalizedProcedureBlobMock: vi.fn(),
  exportDocxMock: vi.fn(),
  exportPdfMock: vi.fn(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1AdministrativeFileDraftExportAdministrativeFileDraftDocx:
    mocks.exportDocxMock,
  v1AdministrativeFileDraftExportAdministrativeFileDraftPdf:
    mocks.exportPdfMock,
}));

vi.mock('./finalizeProcedureDownload', () => ({
  downloadFinalizedProcedureBlob: mocks.downloadFinalizedProcedureBlobMock,
}));

vi.mock('./FinalExportConfetti', () => ({
  default: () => <div>confetti</div>,
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/features/ui/alert/Alert', () => ({
  Alert: (props: ComponentProps<'div'>) => <div>{props.children}</div>,
  AlertDescription: (props: ComponentProps<'div'>) => (
    <div>{props.children}</div>
  ),
  AlertTitle: (props: ComponentProps<'div'>) => <div>{props.children}</div>,
}));

vi.mock('@/features/ui/button/Button', () => ({
  Button: (
    props: ComponentProps<'button'> & {
      loading?: boolean;
      variant?: string;
      withIcon?: boolean;
    },
  ) => {
    const {
      children,
      loading: _loading,
      type = 'button',
      variant: _variant,
      withIcon: _withIcon,
      ...buttonProps
    } = props;

    return (
      <button type={type} {...buttonProps}>
        {children}
      </button>
    );
  },
}));

vi.mock('@/features/ui/dialog/Dialog', () => ({
  Dialog: (props: { children: ReactNode; open: boolean }) =>
    props.open ? <div>{props.children}</div> : null,
  DialogContent: (
    props: ComponentProps<'div'> & {
      innerClassName?: string;
      showCloseButton?: boolean;
    },
  ) => {
    const {
      children,
      innerClassName: _innerClassName,
      showCloseButton: _showCloseButton,
      ...divProps
    } = props;

    return <div {...divProps}>{children}</div>;
  },
  DialogFooter: (props: ComponentProps<'div'>) => <div>{props.children}</div>,
  DialogHeader: (props: ComponentProps<'div'>) => <div>{props.children}</div>,
  DialogTitle: (props: ComponentProps<'h2'>) => <h2>{props.children}</h2>,
}));

const createResponse = (contentDisposition: string | null) => ({
  headers: {
    get: (name: string) =>
      name.toLowerCase() === 'content-disposition' ? contentDisposition : null,
  },
});

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
};

describe('FinalizeProcedureDialog', () => {
  const createObjectURLMock = vi.fn();
  const revokeObjectURLMock = vi.fn();

  beforeEach(() => {
    createObjectURLMock.mockReset();
    revokeObjectURLMock.mockReset();
    createObjectURLMock.mockReturnValue('blob:preview-url');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLMock,
    });
    mocks.downloadFinalizedProcedureBlobMock.mockReset();
    mocks.exportDocxMock.mockReset();
    mocks.exportPdfMock.mockReset();
  });

  afterEach(cleanup);

  it('loads a PDF preview and revokes the object URL on unmount', async () => {
    const previewBlob = new Blob(['preview-pdf']);
    mocks.exportPdfMock.mockResolvedValueOnce({
      data: previewBlob,
      response: createResponse(null),
    });

    const { unmount } = render(
      <FinalizeProcedureDialog onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText('shared:app.loading')).toBeInTheDocument();
    const previewFrame = await screen.findByTitle('finalize.previewTitle');
    expect(previewFrame).toHaveAttribute('src', 'blob:preview-url');
    expect(previewFrame).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(previewFrame).not.toHaveAttribute('sandbox');
    expect(mocks.exportPdfMock).toHaveBeenCalledWith({
      path: { projectId: 'verfahren-1' },
      parseAs: 'blob',
      throwOnError: true,
    });

    unmount();

    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:preview-url');
  });

  it('shows a preview error when the preview export fails', async () => {
    mocks.exportPdfMock.mockRejectedValueOnce(new Error('preview failed'));

    render(<FinalizeProcedureDialog onOpenChange={vi.fn()} />);

    expect(
      await screen.findByText('finalize.previewErrorTitle'),
    ).toBeInTheDocument();
    expect(screen.queryByTitle('finalize.previewTitle')).toBeNull();
  });

  it('shows a preview error when the preview export is not a Blob', async () => {
    mocks.exportPdfMock.mockResolvedValueOnce({
      data: { unexpected: true },
      response: createResponse(null),
    });

    render(<FinalizeProcedureDialog onOpenChange={vi.fn()} />);

    expect(
      await screen.findByText('finalize.previewErrorTitle'),
    ).toBeInTheDocument();
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it('downloads PDF and DOCX exports with their content-disposition headers', async () => {
    const user = userEvent.setup();
    const previewBlob = new Blob(['preview']);
    const pdfBlob = new Blob(['pdf']);
    const docxBlob = new Blob(['docx']);
    mocks.exportPdfMock.mockResolvedValueOnce({
      data: previewBlob,
      response: createResponse(null),
    });

    render(<FinalizeProcedureDialog onOpenChange={vi.fn()} />);
    await screen.findByTitle('finalize.previewTitle');

    mocks.exportPdfMock.mockResolvedValueOnce({
      data: pdfBlob,
      response: createResponse('attachment; filename="final.pdf"'),
    });
    mocks.exportDocxMock.mockResolvedValueOnce({
      data: docxBlob,
      response: createResponse("attachment; filename*=UTF-8''final.docx"),
    });

    await user.click(
      screen.getByRole('button', { name: /finalize\.downloadPdf/ }),
    );
    await user.click(
      screen.getByRole('button', { name: /finalize\.downloadDocx/ }),
    );

    expect(mocks.downloadFinalizedProcedureBlobMock).toHaveBeenCalledWith(
      pdfBlob,
      'attachment; filename="final.pdf"',
      'pdf',
    );
    expect(mocks.downloadFinalizedProcedureBlobMock).toHaveBeenCalledWith(
      docxBlob,
      "attachment; filename*=UTF-8''final.docx",
      'docx',
    );
  });

  it('disables both download buttons while an export is pending', async () => {
    const user = userEvent.setup();
    const pdfDownload = createDeferred<{
      data: Blob;
      response: ReturnType<typeof createResponse>;
    }>();
    mocks.exportPdfMock.mockResolvedValueOnce({
      data: new Blob(['preview']),
      response: createResponse(null),
    });

    render(<FinalizeProcedureDialog onOpenChange={vi.fn()} />);
    await screen.findByTitle('finalize.previewTitle');
    mocks.exportPdfMock.mockReturnValueOnce(pdfDownload.promise);

    await user.click(
      screen.getByRole('button', { name: /finalize\.downloadPdf/ }),
    );

    expect(
      screen.getByRole('button', { name: /finalize\.downloadPdfLoading/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /finalize\.downloadDocx/ }),
    ).toBeDisabled();

    await act(async () => {
      pdfDownload.resolve({
        data: new Blob(['pdf']),
        response: createResponse(null),
      });
      await pdfDownload.promise;
    });

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /finalize\.downloadPdf/ }),
      ).toBeEnabled(),
    );
  });

  it('shows a download error for a failed DOCX export', async () => {
    const user = userEvent.setup();
    mocks.exportPdfMock.mockResolvedValueOnce({
      data: new Blob(['preview']),
      response: createResponse(null),
    });

    render(<FinalizeProcedureDialog onOpenChange={vi.fn()} />);
    await screen.findByTitle('finalize.previewTitle');
    mocks.exportDocxMock.mockRejectedValueOnce(new Error('docx failed'));

    await user.click(
      screen.getByRole('button', { name: /finalize\.downloadDocx/ }),
    );

    expect(
      await screen.findByText('finalize.downloadErrorTitle'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('finalize.downloadDocxErrorBody'),
    ).toBeInTheDocument();
  });

  it('shows a download error when an export response is not a Blob', async () => {
    const user = userEvent.setup();
    mocks.exportPdfMock.mockResolvedValueOnce({
      data: new Blob(['preview']),
      response: createResponse(null),
    });

    render(<FinalizeProcedureDialog onOpenChange={vi.fn()} />);
    await screen.findByTitle('finalize.previewTitle');
    mocks.exportPdfMock.mockResolvedValueOnce({
      data: { unexpected: true },
      response: createResponse(null),
    });

    await user.click(
      screen.getByRole('button', { name: /finalize\.downloadPdf/ }),
    );

    expect(
      await screen.findByText('finalize.downloadErrorTitle'),
    ).toBeInTheDocument();
    expect(mocks.downloadFinalizedProcedureBlobMock).not.toHaveBeenCalled();
  });
});
