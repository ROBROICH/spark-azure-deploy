import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfViewerPane } from './PdfViewerPane';

const mocks = vi.hoisted(() => ({
  useProjectFilePreview: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/features/project/data/project-files/useProjectFilePreview', () => ({
  useProjectFilePreview: mocks.useProjectFilePreview,
}));

vi.mock('../PdfPopoutWorkspaceContext', () => ({
  usePdfPopout: () => ({
    projectId: 'verfahren-1',
    documentPreviewById: new Map([
      ['file-1', { title: 'Known document', isPdf: true }],
    ]),
    connectedFileId: undefined,
    connectedPageJump: null,
    getPagePosition: vi.fn(),
    savePagePosition: vi.fn(),
  }),
}));

vi.mock('./iframe-viewer/PdfIframeDocumentViewer', () => ({
  PdfIframeDocumentViewer: (props: { hasDocumentNotFound?: boolean }) => (
    <div data-testid="viewer">
      not-found:{String(props.hasDocumentNotFound)}
    </div>
  ),
}));

beforeEach(() => {
  mocks.useProjectFilePreview.mockReset();
  mocks.useProjectFilePreview.mockReturnValue({
    title: 'Known document',
    downloadUrl: undefined,
    isLoading: false,
    isError: false,
    isFileNotFound: true,
  });
});

describe('PdfViewerPane', () => {
  it('uses the project-file preview gate before rendering a file URL', () => {
    render(<PdfViewerPane documentId="file-1" />);

    expect(mocks.useProjectFilePreview).toHaveBeenCalledWith({
      projectId: 'verfahren-1',
      fileId: 'file-1',
      fallbackTitle: 'Known document',
    });
    expect(screen.getByTestId('viewer')).toHaveTextContent('not-found:true');
  });
});
