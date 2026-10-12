import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfIframeDocumentViewer } from './PdfIframeDocumentViewer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { title?: string }) =>
      key === 'PdfDocumentViewer.frameTitle' && params?.title
        ? `Document view: ${params.title}`
        : key,
  }),
}));

beforeEach(() => {
  window.__APP_CONFIG__ = {
    VITE_ALLOWED_DOWNLOAD_ORIGINS: 'https://example.test',
  };
});

afterEach(() => {
  cleanup();
  window.__APP_CONFIG__ = undefined;
});

describe('PdfIframeDocumentViewer', () => {
  it('opens a document at page one after clearing its source-page target', async () => {
    const { container, rerender } = render(
      <PdfIframeDocumentViewer
        fileUrl="https://example.test/one.pdf"
        documentId="file-1"
        documentTitle="Document one"
        requestedPageNumber={20}
        requestedPageJumpKey={1}
      />,
    );
    expect(
      await screen.findByTitle('Document view: Document one'),
    ).toHaveAttribute('src', 'https://example.test/one.pdf#page=20');

    rerender(
      <PdfIframeDocumentViewer
        fileUrl="https://example.test/one.pdf"
        documentId="file-1"
        documentTitle="Document one"
      />,
    );
    const pendingFrame = container.querySelector('iframe[aria-hidden="true"]');
    expect(pendingFrame).toHaveAttribute(
      'src',
      'https://example.test/one.pdf#page=1',
    );
    if (!pendingFrame) {
      throw new Error('Expected the document to reopen at page one.');
    }
    fireEvent.load(pendingFrame);
    expect(screen.getByTitle('Document view: Document one')).toHaveAttribute(
      'src',
      'https://example.test/one.pdf#page=1',
    );

    rerender(
      <PdfIframeDocumentViewer
        fileUrl="https://example.test/one.pdf"
        documentId="file-1"
        documentTitle="Document one"
        requestedPageNumber={7}
        requestedPageJumpKey={2}
      />,
    );
    expect(
      container.querySelector('iframe[aria-hidden="true"]'),
    ).toHaveAttribute('src', 'https://example.test/one.pdf#page=7');
  });

  it('reopens the target page when the same document is selected again', () => {
    const { container, rerender } = render(
      <PdfIframeDocumentViewer
        fileUrl="https://example.test/one.pdf"
        documentId="file-1"
        requestedPageNumber={1}
        requestedPageJumpKey={1}
      />,
    );
    const initialFrame = container.querySelector('iframe');

    rerender(
      <PdfIframeDocumentViewer
        fileUrl="https://example.test/one.pdf"
        documentId="file-1"
        requestedPageNumber={1}
        requestedPageJumpKey={2}
      />,
    );
    const pendingFrame = container.querySelector('iframe[aria-hidden="true"]');
    expect(pendingFrame).toHaveAttribute(
      'src',
      'https://example.test/one.pdf#page=1',
    );
    expect(pendingFrame).not.toBe(initialFrame);
  });

  it('clears the active iframe when the selected document is removed', async () => {
    const { rerender } = render(
      <PdfIframeDocumentViewer
        fileUrl="https://example.test/one.pdf"
        documentId="file-1"
        documentTitle="Document one"
      />,
    );

    const iframe = await screen.findByTitle('Document view: Document one');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(iframe).not.toHaveAttribute('sandbox');

    rerender(<PdfIframeDocumentViewer />);

    expect(
      screen.getByText('PdfDocumentViewer.emptyState'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTitle('Document view: Document one'),
    ).not.toBeInTheDocument();
  });

  it('keeps pending preload iframes out of the accessibility tree', async () => {
    const { container, rerender } = render(
      <PdfIframeDocumentViewer
        fileUrl="https://example.test/one.pdf"
        documentId="file-1"
        documentTitle="Document one"
      />,
    );
    expect(
      await screen.findByTitle('Document view: Document one'),
    ).toBeInTheDocument();

    rerender(
      <PdfIframeDocumentViewer
        fileUrl="https://example.test/two.pdf"
        documentId="file-2"
        documentTitle="Document two"
      />,
    );

    await waitFor(() => {
      expect(
        container.querySelector('iframe[aria-hidden="true"]'),
      ).toBeInTheDocument();
    });
    const pendingFrame = container.querySelector('iframe[aria-hidden="true"]');
    expect(pendingFrame).toHaveAttribute(
      'title',
      'Document view: Document two',
    );
    expect(pendingFrame).toHaveAttribute('tabindex', '-1');
  });

  it('promotes a pending iframe after it loads', async () => {
    const { container, rerender } = render(
      <PdfIframeDocumentViewer
        fileUrl="https://example.test/one.pdf"
        documentId="file-1"
        documentTitle="Document one"
      />,
    );
    expect(
      await screen.findByTitle('Document view: Document one'),
    ).toHaveAttribute('src', 'https://example.test/one.pdf#page=1');

    rerender(
      <PdfIframeDocumentViewer
        fileUrl="https://example.test/two.pdf"
        documentId="file-2"
        documentTitle="Document two"
      />,
    );

    const pendingFrame = await waitFor(() => {
      const frame = container.querySelector('iframe[aria-hidden="true"]');
      expect(frame).toBeInTheDocument();
      return frame;
    });
    if (!pendingFrame) {
      throw new Error('Expected pending iframe to be rendered.');
    }

    fireEvent.load(pendingFrame);

    await waitFor(() =>
      expect(screen.getByTitle('Document view: Document two')).toHaveAttribute(
        'src',
        'https://example.test/two.pdf#page=1',
      ),
    );
    expect(
      screen.queryByTitle('Document view: Document one'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('iframe[aria-hidden="true"]'),
    ).not.toBeInTheDocument();
  });
});
