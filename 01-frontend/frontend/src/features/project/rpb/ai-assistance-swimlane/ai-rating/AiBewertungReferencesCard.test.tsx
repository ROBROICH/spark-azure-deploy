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
        node_type: 'bewertung_quelle',
        dokument_id: 'dokument-1',
        title: 'Quelle 1A',
        chunk_ids: ['chunk-1'],
        page_numbers: [7],
      },
      {
        id: 'quelle-2',
        node_type: 'bewertung_quelle',
        dokument_id: 'dokument-2',
        title: 'Quelle 2A',
        chunk_ids: ['chunk-2'],
        page_numbers: [11],
      },
      {
        id: 'quelle-3',
        node_type: 'bewertung_quelle',
        dokument_id: 'dokument-1',
        title: 'Quelle 1B',
        chunk_ids: ['chunk-3'],
        page_numbers: [5],
      },
    ],
  }),
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNodes: () => ({
    data: [
      {
        id: 'dokument-1',
        node_type: 'dokument',
        filename: 'Dokument A.pdf',
        dms_file_id: 'project-file-1',
      },
      {
        id: 'dokument-2',
        node_type: 'dokument',
        filename: 'Dokument B.pdf',
        dms_file_id: 'project-file-2',
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
        bewertungRef={{ id: 'bewertung-1', node_type: 'bewertung' }}
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
