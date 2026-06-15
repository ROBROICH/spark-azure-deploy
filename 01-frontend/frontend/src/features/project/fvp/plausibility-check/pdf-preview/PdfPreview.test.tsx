import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfPreview } from './PdfPreview';

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useParamsMock: vi.fn(() => ({
    verfahrenId: 'project-1',
  })),
  useSearchMock: vi.fn(() => ({
    previewDocumentId: 'doc-1',
    previewPageNumber: 7,
  })),
  useProjectFilePreviewMock: vi.fn(
    (_props: {
      projectId: string;
      fileId: string | null | undefined;
      fallbackTitle: string;
    }): {
      title: string;
      downloadUrl: string | undefined;
      isLoading: boolean;
    } => ({
      title: 'Real.pdf',
      downloadUrl: 'https://example.test/files/doc-1.pdf',
      isLoading: false,
    }),
  ),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: mocks.useParamsMock,
    useSearch: mocks.useSearchMock,
  }),
  useNavigate: () => mocks.navigateMock,
}));

vi.mock('@/features/project/data/project-files/useProjectFilePreview', () => ({
  useProjectFilePreview: (props: {
    projectId: string;
    fileId: string | null | undefined;
    fallbackTitle: string;
  }) => mocks.useProjectFilePreviewMock(props),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations = {
        'common.document': 'Document',
      } satisfies Record<string, string>;

      if (Object.hasOwn(translations, key)) {
        return translations[key as keyof typeof translations];
      }

      return key;
    },
  }),
}));

vi.mock('@/features/project/pdf-quick-view/PdfQuickView', () => ({
  PdfQuickView: (props: {
    title: string;
    pdfUrl?: string;
    onClose: () => void;
    pageNumber?: number;
    isLoading?: boolean;
  }) => {
    const { title, pdfUrl, onClose, pageNumber, isLoading } = props;

    return (
      <div>
        <div>{title}</div>
        <div>{pdfUrl}</div>
        <div>{pageNumber}</div>
        <div>{String(isLoading)}</div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    );
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PlausibilityCheck PdfPreview', () => {
  it('passes the live file name and download URL into the shared preview', () => {
    render(<PdfPreview />);

    expect(mocks.useProjectFilePreviewMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      fileId: 'doc-1',
      fallbackTitle: 'Document',
    });
    expect(screen.getByText('Real.pdf')).toBeTruthy();
    expect(
      screen.getByText('https://example.test/files/doc-1.pdf'),
    ).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('false')).toBeTruthy();
  });

  it('clears the route-backed preview params when the preview closes', () => {
    render(<PdfPreview />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(mocks.navigateMock).toHaveBeenCalledTimes(1);

    const navigateArgs = mocks.navigateMock.mock.calls[0]?.[0] as {
      to: string;
      replace: boolean;
      resetScroll: boolean;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };

    expect(navigateArgs.to).toBe('.');
    expect(navigateArgs.replace).toBe(true);
    expect(navigateArgs.resetScroll).toBe(false);
    expect(
      navigateArgs.search({
        previewDocumentId: 'doc-1',
        previewPageNumber: 7,
        search: 'keep me',
      }),
    ).toEqual({
      previewDocumentId: undefined,
      previewPageNumber: undefined,
      search: 'keep me',
    });
  });
});
