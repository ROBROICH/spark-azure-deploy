import '@testing-library/jest-dom/vitest';

import { act, cleanup, render, screen } from '@testing-library/react';
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
  vi.useRealTimers();
  vi.restoreAllMocks();
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

  it('collapses after popout and remounts inline content after popin timing completes', () => {
    vi.useFakeTimers();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { rerender } = render(<PdfPopoutSwimlane />);

    expect(screen.getByText('Inline PDF viewer')).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'PDF documents' });
    expect(section).toHaveStyle({ flexBasis: '0%' });

    pdfPopoutState.isPoppedOut = true;
    rerender(<PdfPopoutSwimlane />);

    expect(screen.queryByText('Inline PDF viewer')).not.toBeInTheDocument();
    expect(screen.getByText('Collapsed PDF lane')).toBeInTheDocument();
    expect(section).toHaveStyle({ flexBasis: '0%' });

    act(() => vi.advanceTimersByTime(50));

    expect(section).toHaveStyle({ flexBasis: '52px' });

    pdfPopoutState.isPoppedOut = false;
    rerender(<PdfPopoutSwimlane />);

    expect(screen.queryByText('Inline PDF viewer')).not.toBeInTheDocument();
    expect(section).toHaveStyle({ flexBasis: '0%' });

    act(() => vi.advanceTimersByTime(499));
    expect(screen.queryByText('Inline PDF viewer')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('Inline PDF viewer')).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
