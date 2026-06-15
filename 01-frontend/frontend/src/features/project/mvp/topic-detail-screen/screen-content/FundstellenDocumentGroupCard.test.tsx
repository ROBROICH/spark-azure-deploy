import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FundstellenDocumentGroupCard } from './FundstellenDocumentGroupCard';
import type { FundstellenDocumentGroupCardModel } from './mvpFundstellenCardModels';

const { jumpToConnectedFilePageMock, navigateMock, openConnectedFileMock } =
  vi.hoisted(() => ({
    jumpToConnectedFilePageMock: vi.fn(),
    navigateMock: vi.fn(),
    openConnectedFileMock: vi.fn(),
  }));

vi.mock('@/features/project/pdf-popout/PdfPopoutWorkspaceContext', () => ({
  usePdfPopout: () => ({
    openConnectedFile: openConnectedFileMock,
    jumpToConnectedFilePage: jumpToConnectedFilePageMock,
  }),
}));

vi.mock('@/features/feedback/NodeFeedbackThumbButtons', () => ({
  NodeFeedbackThumbButtons: () => null,
}));

vi.mock('@/features/feedback/useFeedbackLookup', () => ({
  useFeedbackLookup: () => ({
    getFeedbackForTarget: () => ({ feedback: null, feedbackRef: null }),
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => navigateMock,
    useSearch: (props: { select: (s: Record<string, unknown>) => unknown }) =>
      props.select({}),
  }),
}));

vi.mock('@/features/ui/skeleton/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'FundstellenDocumentGroupCard.showMore') {
        return `${String(params?.count ?? 0)} mehr anzeigen`;
      }

      const translations = {
        'FundstellenDocumentGroupCard.outdated': 'Veraltet',
        'FundstellenDocumentGroupCard.showLess': 'Weniger anzeigen',
        'FundstellenDocumentGroupCard.pageNumber': `S. ${String(params?.page ?? '')}`,
        'FundstellenDocumentGroupCard.fundstelleAriaLabel': `${String(params?.title ?? '')}, Seite ${String(params?.page ?? '')}`,
        'FundstellenTabContent.keinDokument': 'Keine Unterlage',
      } satisfies Record<string, string>;

      if (key in translations) {
        return translations[key as keyof typeof translations];
      }

      return key;
    },
  }),
}));

describe('FundstellenDocumentGroupCard', () => {
  afterEach(cleanup);

  beforeEach(() => {
    navigateMock.mockReset();
    openConnectedFileMock.mockReset();
    jumpToConnectedFilePageMock.mockReset();
  });

  it('opens the connected document and jumps to the page when an entry is clicked', async () => {
    const user = userEvent.setup();
    const fundstellenDocumentGroupCard: FundstellenDocumentGroupCardModel = {
      documentId: 'doc-1',
      entries: [{ id: 'fundstelle-1', pageNumber: 4, title: 'Fundstelle 1' }],
    };

    render(
      <FundstellenDocumentGroupCard
        documentFileId="resolved-file-1"
        documentLabel="Aufgeloestes Dokument 1.pdf"
        fundstellenDocumentGroupCard={fundstellenDocumentGroupCard}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Fundstelle 1, Seite 4' }),
    );

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        resetScroll: false,
        search: expect.any(Function),
      }),
    );
    const navigateOptions = navigateMock.mock.calls[0]?.[0];
    expect(
      navigateOptions.search({
        feedbackTargetId: 'fundstelle-feedback',
        selectedDocumentId: 'doc-1',
        selectedNormId: 'norm-1',
      }),
    ).toEqual({
      feedbackTargetId: 'fundstelle-feedback',
      selectedDocumentId: 'doc-1',
      selectedNormId: 'norm-1',
      previewDocumentId: 'doc-1',
    });
    expect(openConnectedFileMock).toHaveBeenCalledWith('resolved-file-1');
    expect(jumpToConnectedFilePageMock).toHaveBeenCalledWith(
      4,
      'resolved-file-1',
    );
  });

  it('shows stale document aggregate state without a refresh action', () => {
    const fundstellenDocumentGroupCard: FundstellenDocumentGroupCardModel = {
      documentId: 'doc-1',
      hasOutdatedFundstellen: true,
      entries: [{ id: 'fundstelle-1', pageNumber: 4, title: 'Fundstelle 1' }],
    };

    render(
      <FundstellenDocumentGroupCard
        documentFileId="resolved-file-1"
        documentLabel="Aufgeloestes Dokument 1.pdf"
        fundstellenDocumentGroupCard={fundstellenDocumentGroupCard}
      />,
    );

    expect(screen.getByText('Veraltet')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Aktualisieren' })).toBeNull();
  });

  it('keeps row selection and show-more behavior in the neutral aggregate card', async () => {
    const user = userEvent.setup();
    const fundstellenDocumentGroupCard: FundstellenDocumentGroupCardModel = {
      documentId: 'doc-1',
      entries: [
        { id: 'fundstelle-1', pageNumber: 1, title: 'Fundstelle 1' },
        { id: 'fundstelle-2', pageNumber: 2, title: 'Fundstelle 2' },
        { id: 'fundstelle-3', pageNumber: 3, title: 'Fundstelle 3' },
        { id: 'fundstelle-4', pageNumber: 4, title: 'Fundstelle 4' },
        { id: 'fundstelle-5', pageNumber: 5, title: 'Fundstelle 5' },
        { id: 'fundstelle-6', pageNumber: 6, title: 'Fundstelle 6' },
        { id: 'fundstelle-7', pageNumber: 7, title: 'Fundstelle 7' },
      ],
    };

    render(
      <FundstellenDocumentGroupCard
        documentFileId="resolved-file-1"
        documentLabel="Aufgeloestes Dokument 1.pdf"
        fundstellenDocumentGroupCard={fundstellenDocumentGroupCard}
        selectedFundstelleId="fundstelle-1"
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(
      screen.getByRole('button', {
        name: 'Fundstelle 1, Seite 1',
        pressed: true,
      }),
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: '1 mehr anzeigen' }));

    expect(screen.getAllByRole('button')).toHaveLength(8);
    expect(
      screen.getByRole('button', { name: 'Weniger anzeigen' }),
    ).toBeDefined();
  });
});
