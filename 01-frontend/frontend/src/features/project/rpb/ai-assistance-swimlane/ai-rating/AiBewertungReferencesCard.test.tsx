import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiBewertungReferencesCard } from './AiBewertungReferencesCard';

const mocks = vi.hoisted(() => ({
  jumpToConnectedFilePageMock: vi.fn(),
  navigateMock: vi.fn(),
  openConnectedFileMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => mocks.navigateMock,
    useSearch: ({
      select,
    }: {
      select: (s: Record<string, unknown>) => unknown;
    }) => select({}),
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
        'aiAssistance.references': 'Fundstellen',
        'aiAssistance.referencePages': `S. ${String(options?.pages ?? '')}`,
        'aiAssistance.referencePagesUnknown': 'S. --',
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/db/nodes/hooks/useDescendantNodes', () => ({
  useDescendantNodes: () => ({
    data: [
      {
        id: 'quelle-1',
        nodeType: 'bewertung_quelle',
        dokumentId: 'dokument-1',
        title: 'Quelle 1A',
        chunkIds: ['chunk-1'],
        pageNumbers: [7],
      },
      {
        id: 'quelle-2',
        nodeType: 'bewertung_quelle',
        dokumentId: 'dokument-2',
        title: 'Quelle 2A',
        chunkIds: ['chunk-2'],
        pageNumbers: [11],
      },
      {
        id: 'quelle-3',
        nodeType: 'bewertung_quelle',
        dokumentId: 'dokument-1',
        title: 'Quelle 1B',
        chunkIds: ['chunk-3'],
        pageNumbers: [5],
      },
    ],
  }),
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNodes: () => ({
    data: [
      {
        id: 'dokument-1',
        nodeType: 'dokument',
        filename: 'Dokument A.pdf',
        dmsFileId: 'project-file-1',
      },
      {
        id: 'dokument-2',
        nodeType: 'dokument',
        filename: 'Dokument B.pdf',
        dmsFileId: 'project-file-2',
      },
    ],
  }),
}));

describe('AiBewertungReferencesCard', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.openConnectedFileMock.mockReset();
    mocks.jumpToConnectedFilePageMock.mockReset();
    mocks.navigateMock.mockReset();
  });

  it('groups reference entries by document and opens sources at their referenced page', async () => {
    const user = userEvent.setup();

    render(
      <AiBewertungReferencesCard
        bewertungRef={{ id: 'bewertung-1', nodeType: 'bewertung' }}
      />,
    );

    expect(screen.getByText('Fundstellen')).toBeInTheDocument();

    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual([
      'Dokument A.pdf',
      'Quelle 1BS. 5',
      'Quelle 1AS. 7',
      'Dokument B.pdf',
      'Quelle 2AS. 11',
    ]);

    await user.click(screen.getByRole('button', { name: /Quelle 1B/ }));

    expect(mocks.navigateMock).toHaveBeenCalled();
    expect(mocks.openConnectedFileMock).toHaveBeenCalledWith('project-file-1');
    expect(mocks.jumpToConnectedFilePageMock).toHaveBeenCalledWith(
      5,
      'project-file-1',
    );
  });
});
