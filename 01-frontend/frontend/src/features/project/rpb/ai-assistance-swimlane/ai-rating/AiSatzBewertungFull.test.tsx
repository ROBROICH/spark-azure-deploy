import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSatzBewertungFull } from './AiSatzBewertungFull';

const mocks = vi.hoisted(() => ({
  jumpToConnectedFilePageMock: vi.fn(),
  navigateMock: vi.fn(),
  openConnectedFileMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => mocks.navigateMock,
    useSearch: () => ({ satzId: 'satz-1' }),
  }),
}));

vi.mock('@/features/project/pdf-popout/PdfPopoutWorkspaceContext', () => ({
  usePdfPopout: () => ({
    openConnectedFile: mocks.openConnectedFileMock,
    jumpToConnectedFilePage: mocks.jumpToConnectedFilePageMock,
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'aiAssistance.assessmentDetailTitle': 'KI-Bewertung',
        'aiAssistance.assessmentSummaryTitle':
          'Zusammenfassung der KI-Bewertung',
        'aiAssistance.satzTitle': `Absatz ${String(options?.absatz ?? '')} Satz ${String(options?.satz ?? '')}`,
        'aiAssistance.satzTitleWithMarker': `Absatz ${String(options?.absatz ?? '')} Satz ${String(options?.satz ?? '')} ${String(options?.marker ?? '')}`,
        'aiAssistance.satzTitleWithoutSatz': `Absatz ${String(options?.absatz ?? '')}`,
        'aiAssistance.satzTitleWithoutSatzWithMarker': `Absatz ${String(options?.absatz ?? '')} ${String(options?.marker ?? '')}`,
        'aiAssistance.satzMarkerNumber': `Nr. ${String(options?.marker ?? '')}`,
        'aiAssistance.satzMarkerLetter': `${String(options?.marker ?? '')})`,
        'aiAssistance.satzMarkerDoubleLetter': `${String(options?.marker ?? '')})`,
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/db/nodes/hooks/useDescendantNodes', () => ({
  useDescendantNodes: (nodeType: string) => {
    if (nodeType === 'bewertung_kapitel') {
      return {
        data: [
          {
            id: 'kapitel-2',
            nodeType: 'bewertung_kapitel',
            titel: 'Kapitel B',
            markdown: 'Zweite Begruendung [42]',
            order: 2,
          },
          {
            id: 'kapitel-1',
            nodeType: 'bewertung_kapitel',
            titel: 'Kapitel A',
            markdown: 'Erste Begruendung [17]',
            order: 1,
          },
        ],
      };
    }

    return {
      data: [
        {
          id: 'quelle-1',
          nodeType: 'bewertung_quelle',
          dokumentId: 'topic-doc-1',
          title: 'Beispieldokument A',
          chunkIds: ['chunk-1'],
          pageNumbers: [5, 7],
        },
        {
          id: 'quelle-2',
          nodeType: 'bewertung_quelle',
          dokumentId: 'topic-doc-1',
          title: 'Bearbeiter:',
          chunkIds: ['chunk-2'],
          pageNumbers: [11],
        },
      ],
    };
  },
}));

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: (nodeType: string) => {
    if (nodeType === 'satz') {
      return [{ id: 'satz-1', nodeType: 'satz' }];
    }

    if (nodeType === 'absatz') {
      return [{ id: 'absatz-1', nodeType: 'absatz' }];
    }

    return [];
  },
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNode: (nodeRef: { id: string; nodeType: string } | null) => {
    if (nodeRef?.nodeType === 'satz') {
      return {
        data: {
          id: 'satz-1',
          nodeType: 'satz',
          absatzId: 'absatz-1',
          satzNr: '2',
          position: 99,
          markers: ['3', 'Nr 5'],
          text: 'Der Satztext',
        },
      };
    }

    if (nodeRef?.nodeType === 'absatz') {
      return {
        data: {
          id: 'absatz-1',
          nodeType: 'absatz',
          normId: 'norm-1',
          absatzNr: '1',
        },
      };
    }

    return { data: null };
  },
  useNodes: () => {
    return {
      data: [
        {
          id: 'topic-doc-1',
          nodeType: 'dokument',
          dmsFileId: 'project-file-1',
          filename: 'Beispieldokument A.pdf',
        },
      ],
    };
  },
}));

describe('AiSatzBewertungFull', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.openConnectedFileMock.mockReset();
    mocks.jumpToConnectedFilePageMock.mockReset();
    mocks.navigateMock.mockReset();
  });

  it('opens the referenced connected document at the referenced page', async () => {
    const user = userEvent.setup();

    render(
      <AiSatzBewertungFull
        bewertungRef={{ id: 'bewertung-1', nodeType: 'bewertung' }}
        summaryText={'# Einleitung\n\nKurze Zusammenfassung [17]'}
      />,
    );

    expect(screen.getByText('Absatz 1 Nr. 3')).toBeInTheDocument();
    expect(screen.getByText('Der Satztext')).toBeInTheDocument();
    expect(screen.getByText(/Einleitung/)).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Zusammenfassung der KI-Bewertung',
      'KI-Bewertung',
    ]);
    expect(screen.getByText('Beispieldokument A.pdf')).toBeInTheDocument();
    expect(screen.getByText('Beispieldokument A')).toBeInTheDocument();
    expect(screen.getByText('Bearbeiter:')).toBeInTheDocument();

    const referenceButton = screen
      .getAllByRole('button', {
        name: /\[17\] Beispieldokument A/,
      })
      .at(0);
    expect(referenceButton).toBeDefined();
    await user.click(referenceButton as HTMLElement);

    expect(mocks.navigateMock).toHaveBeenCalled();
    expect(mocks.openConnectedFileMock).toHaveBeenCalledWith('project-file-1');
    expect(mocks.jumpToConnectedFilePageMock).toHaveBeenCalledWith(
      5,
      'project-file-1',
    );

    await user.click(
      screen.getByRole('button', {
        name: /\[42\] Bearbeiter:/,
      }),
    );

    expect(mocks.jumpToConnectedFilePageMock).toHaveBeenCalledWith(
      11,
      'project-file-1',
    );
  });
});
