import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FundstellenNormGroupCard } from './FundstellenNormGroupCard';
import type { FundstellenNormGroupCardModel } from './mvpFundstellenCardModels';

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
      if (key === 'FundstellenNormGroupCard.showMore') {
        return `${String(params?.count ?? 0)} mehr anzeigen`;
      }

      if (key === 'FundstellenReliability.focusCount') {
        return `Fokus: ${String(params?.focused ?? '')} von ${String(params?.total ?? '')}`;
      }

      const translations = {
        'FundstellenReliability.notInFocusExplanation':
          'Nicht im Fokus. Keine konkreten Angaben zum Sachverhalt.',
        'FundstellenReliability.unratedExplanation':
          'Nicht im Fokus. Keine Einschätzung der KI vorhanden.',
        'FundstellenNormGroupCard.outdated': 'Veraltet',
        'FundstellenNormGroupCard.refresh': 'Aktualisieren',
        'FundstellenNormGroupCard.showLess': 'Weniger anzeigen',
        'FundstellenNormGroupCard.pageNumber': `S. ${String(params?.page ?? '')}`,
        'FundstellenNormGroupCard.fundstelleAriaLabel': `${String(params?.title ?? '')}, Seite ${String(params?.page ?? '')}`,
      } satisfies Record<string, string>;

      if (key in translations) {
        return translations[key as keyof typeof translations];
      }

      return key;
    },
  }),
}));

describe('FundstellenNormGroupCard', () => {
  afterEach(cleanup);

  beforeEach(() => {
    jumpToConnectedFilePageMock.mockReset();
    navigateMock.mockReset();
    openConnectedFileMock.mockReset();
  });

  it('shows neutral aggregate structure and expands fundstellen on demand', async () => {
    const user = userEvent.setup();
    const fundstellenNormGroupCard: FundstellenNormGroupCardModel = {
      normId: 'norm-1',
      entries: [
        { id: 'fundstelle-1', pageNumber: 12, title: 'Fundstelle 1' },
        { id: 'fundstelle-2', pageNumber: 3, title: 'Fundstelle 2' },
        { id: 'fundstelle-3', pageNumber: 9, title: 'Fundstelle 3' },
        { id: 'fundstelle-4', pageNumber: 6, title: 'Fundstelle 4' },
        { id: 'fundstelle-5', pageNumber: 14, title: 'Fundstelle 5' },
        { id: 'fundstelle-6', pageNumber: 8, title: 'Fundstelle 6' },
        { id: 'fundstelle-7', pageNumber: 11, title: 'Fundstelle 7' },
        { id: 'fundstelle-8', pageNumber: 4, title: 'Fundstelle 8' },
      ],
    };

    const { container } = render(
      <FundstellenNormGroupCard
        documentFileId="doc-file-1"
        fundstellenNormGroupCard={fundstellenNormGroupCard}
        normLabel="§ 44 Artenschutzrechtliche Verbote BNatSchG"
      />,
    );

    expect(
      screen.getByText('§ 44 Artenschutzrechtliche Verbote BNatSchG'),
    ).toBeDefined();
    expect(container.querySelector('.border-slate-400')).toBeDefined();
    expect(container.querySelector('.border-purple-500')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(6);
    expect(
      screen.getByRole('button', { name: '2 mehr anzeigen' }),
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: '2 mehr anzeigen' }));

    expect(screen.getAllByRole('link')).toHaveLength(8);
    expect(
      screen.getByRole('button', { name: 'Weniger anzeigen' }),
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Weniger anzeigen' }));

    expect(screen.getAllByRole('link')).toHaveLength(6);
  });

  it('shows outdated state with a bottom-right refresh action', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const fundstellenNormGroupCard: FundstellenNormGroupCardModel = {
      normId: 'norm-1',
      hasOutdatedFundstellen: true,
      entries: [{ id: 'fundstelle-1', pageNumber: 12, title: 'Fundstelle 1' }],
    };

    render(
      <FundstellenNormGroupCard
        documentFileId="doc-file-1"
        fundstellenNormGroupCard={fundstellenNormGroupCard}
        normLabel="§ 44 Artenschutzrechtliche Verbote BNatSchG"
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByText('Veraltet')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Aktualisieren' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('marks a selected row without changing the accessible row name', () => {
    const fundstellenNormGroupCard: FundstellenNormGroupCardModel = {
      normId: 'norm-1',
      entries: [
        { id: 'fundstelle-1', pageNumber: 3, title: 'Ausgewählte Fundstelle' },
      ],
    };

    render(
      <FundstellenNormGroupCard
        documentFileId="doc-file-1"
        fundstellenNormGroupCard={fundstellenNormGroupCard}
        normLabel="§ 44 Artenschutzrechtliche Verbote BNatSchG"
        selectedFundstelleId="fundstelle-1"
      />,
    );

    expect(
      screen.getByRole('link', {
        name: 'Ausgewählte Fundstelle, Seite 3',
        current: 'location',
      }),
    ).toBeDefined();
  });

  it('opens the connected document and preserves route search when a row is clicked', async () => {
    const user = userEvent.setup();
    const fundstellenNormGroupCard: FundstellenNormGroupCardModel = {
      normId: 'norm-1',
      entries: [{ id: 'fundstelle-1', pageNumber: 3, title: 'Fundstelle 1' }],
    };

    render(
      <FundstellenNormGroupCard
        documentFileId="doc-file-1"
        documentId="document-1"
        fundstellenNormGroupCard={fundstellenNormGroupCard}
        normLabel="§ 44 Artenschutzrechtliche Verbote BNatSchG"
      />,
    );

    await user.click(
      screen.getByRole('link', { name: 'Fundstelle 1, Seite 3' }),
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
        selectedDocumentId: 'document-1',
        selectedNormId: 'norm-1',
      }),
    ).toEqual({
      feedbackTargetId: 'fundstelle-feedback',
      selectedDocumentId: 'document-1',
      selectedNormId: 'norm-1',
      previewDocumentId: 'document-1',
    });
    expect(openConnectedFileMock).toHaveBeenCalledWith('doc-file-1');
    expect(jumpToConnectedFilePageMock).toHaveBeenCalledWith(3, 'doc-file-1');
  });

  it('marks only the findings that do not carry the assessment', () => {
    const fundstellenNormGroupCard: FundstellenNormGroupCardModel = {
      normId: 'norm-1',
      entries: [
        {
          id: 'fundstelle-1',
          pageNumber: 3,
          title: 'Tragende Fundstelle',
          confidence: 0.9,
        },
        {
          id: 'fundstelle-2',
          pageNumber: 4,
          title: 'Ergaenzende Fundstelle',
          confidence: 0.2,
        },
        { id: 'fundstelle-3', pageNumber: 5, title: 'Fundstelle ohne Wert' },
      ],
    };

    render(
      <FundstellenNormGroupCard
        documentFileId="doc-file-1"
        fundstellenNormGroupCard={fundstellenNormGroupCard}
      />,
    );

    expect(
      screen.getByRole('img', {
        name: 'Nicht im Fokus. Keine konkreten Angaben zum Sachverhalt.',
      }),
    ).toBeDefined();
    expect(
      screen.getByRole('img', {
        name: 'Nicht im Fokus. Keine Einschätzung der KI vorhanden.',
      }),
    ).toBeDefined();
    // The carrying finding stays unmarked, so the mark reads as a deviation.
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('states in the header how many findings carry the assessment', () => {
    const fundstellenNormGroupCard: FundstellenNormGroupCardModel = {
      normId: 'norm-1',
      entries: [
        {
          id: 'fundstelle-1',
          pageNumber: 3,
          title: 'Tragende Fundstelle',
          confidence: 0.9,
        },
        {
          id: 'fundstelle-2',
          pageNumber: 4,
          title: 'Ergaenzende Fundstelle',
          confidence: 0.2,
        },
        { id: 'fundstelle-3', pageNumber: 5, title: 'Fundstelle ohne Wert' },
      ],
    };

    render(
      <FundstellenNormGroupCard
        documentFileId="doc-file-1"
        fundstellenNormGroupCard={fundstellenNormGroupCard}
      />,
    );

    expect(screen.getByText('Fokus: 1 von 3')).toBeDefined();
  });
});
