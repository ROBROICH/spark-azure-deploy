import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfPopoutSwimlane } from './PdfPopoutSwimlane';

const pdfPopoutState = vi.hoisted(() => ({
  isPoppedOut: false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'PdfViewerLane.title' ? 'PDF documents' : key),
  }),
}));

vi.mock('@/features/project/pdf-popout/PdfPopoutWorkspaceContext', () => ({
  usePdfPopout: () => ({
    isPoppedOut: pdfPopoutState.isPoppedOut,
    connectedFileId: null,
    tree: [],
    isLoadingFiles: false,
    isFilesError: false,
    documentPreviewById: new Map(),
    popOut: vi.fn(),
    selectPaneDocument: vi.fn(),
    requestFileCatalog: vi.fn(),
  }),
}));

vi.mock('@/features/project/pdf-popout/file-tree/PdfFileTreePopover', () => ({
  PdfFileTreePopover: () => null,
}));

vi.mock('@/features/project/pdf-popout/viewer/PdfViewerPane', () => ({
  PdfViewerPane: () => <div>Inline PDF viewer</div>,
}));

vi.mock('@/features/project/pdf-popout/popout/PdfCollapsedLane', () => ({
  PdfCollapsedLane: () => <div>Collapsed PDF lane</div>,
}));

beforeEach(() => {
  pdfPopoutState.isPoppedOut = false;
});

afterEach(() => {
  cleanup();
});

describe('PdfPopoutSwimlane landmarks', () => {
  it('exposes the lane as a section labelled by the visible header title', () => {
    render(<PdfPopoutSwimlane />);

    const section = screen.getByRole('region', { name: 'PDF documents' });
    const labelledById = section.getAttribute('aria-labelledby');
    expect(labelledById).toBeTruthy();

    const heading = labelledById ? document.getElementById(labelledById) : null;
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('PDF documents');
  });

  it('switches between the inline viewer and the collapsed popout lane', () => {
    const { rerender } = render(<PdfPopoutSwimlane />);
    expect(screen.getByText('Inline PDF viewer')).toBeInTheDocument();

    pdfPopoutState.isPoppedOut = true;
    rerender(<PdfPopoutSwimlane />);
    expect(screen.queryByText('Inline PDF viewer')).not.toBeInTheDocument();
    expect(screen.getByText('Collapsed PDF lane')).toBeInTheDocument();

    pdfPopoutState.isPoppedOut = false;
    rerender(<PdfPopoutSwimlane />);
    expect(screen.getByText('Inline PDF viewer')).toBeInTheDocument();
    expect(screen.queryByText('Collapsed PDF lane')).not.toBeInTheDocument();
  });
});
