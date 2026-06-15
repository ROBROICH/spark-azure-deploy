import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FundstellenSelectedReferenceCard } from './FundstellenSelectedReferenceCard';

const { jumpToConnectedFilePageMock, navigateMock, openConnectedFileMock } =
  vi.hoisted(() => ({
    jumpToConnectedFilePageMock: vi.fn(),
    navigateMock: vi.fn(),
    openConnectedFileMock: vi.fn(),
  }));

vi.mock('@/features/project/pdf-popout/PdfPopoutWorkspaceContext', () => ({
  usePdfPopout: () => ({
    jumpToConnectedFilePage: jumpToConnectedFilePageMock,
    openConnectedFile: openConnectedFileMock,
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => navigateMock,
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

vi.mock('@/features/ui/ai/AiReferenceCard', () => ({
  AiReferenceCard: (props: { children: ReactNode; title: string }) => (
    <section aria-label={props.title}>{props.children}</section>
  ),
}));

vi.mock('@/features/ui/ai/AiReferenceRow', () => ({
  AiReferenceRow: (props: {
    item: { label: string; page?: string };
    onClick?: () => void;
  }) => (
    <button type="button" onClick={props.onClick}>
      {[props.item.label, props.item.page].filter(Boolean).join(' ')}
    </button>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'FundstellenSelectedReferenceCard.pageNumber') {
        return `S. ${String(params?.page ?? '')}`;
      }

      const translations = {
        'FundstellenTabContent.keinDokument': 'Keine Unterlage',
        'FundstellenTabContent.missingTitlePlaceholder': 'Ohne Titel',
        'FundstellenTabContent.referencesTitle': 'Fundstellen',
      } satisfies Record<string, string>;

      if (key in translations) {
        return translations[key as keyof typeof translations];
      }

      return key;
    },
  }),
}));

const createDocument = (overrides: Partial<NodePayloadByType<'dokument'>>) =>
  ({
    id: 'document-1',
    dms_file_id: 'file-1',
    filename: 'folder/document.pdf',
    compositeKey: toCompositeKey({ id: 'document-1', node_type: 'dokument' }),
    created_at: '2026-04-02T00:00:00.000Z',
    document_id: null,
    document_type: null,
    frontend_parent_ids: [],
    is_deleted: false,
    is_outdated: false,
    is_toc_document: false,
    markdown_text_id: 'markdown-text-1',
    mime_type: 'application/pdf',
    node_type: 'dokument',
    page_count: 1,
    project_id: 'project-1',
    project_version: 1,
    summary: '',
    sys_period: null,
    update_type: 'automated',
    updated_at: '2026-04-02T00:00:00.000Z',
    ...overrides,
  }) satisfies NodePayloadByType<'dokument'>;

describe('FundstellenSelectedReferenceCard', () => {
  beforeEach(() => {
    jumpToConnectedFilePageMock.mockReset();
    navigateMock.mockReset();
    openConnectedFileMock.mockReset();
  });

  afterEach(cleanup);

  it('opens the selected document and preserves route search', async () => {
    const user = userEvent.setup();

    render(
      <FundstellenSelectedReferenceCard
        document={createDocument({})}
        entries={[{ id: 'fundstelle-1', pageNumber: 4, title: 'Passage 1' }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'document.pdf' }));

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        resetScroll: false,
        search: expect.any(Function),
      }),
    );
    expect(
      navigateMock.mock.calls[0]?.[0].search({ selectedNormId: 'norm-1' }),
    ).toEqual({
      selectedNormId: 'norm-1',
      previewDocumentId: 'document-1',
    });
    expect(openConnectedFileMock).toHaveBeenCalledWith('file-1');
    expect(jumpToConnectedFilePageMock).not.toHaveBeenCalled();
  });

  it('opens and jumps to a selected passage row', async () => {
    const user = userEvent.setup();

    render(
      <FundstellenSelectedReferenceCard
        document={createDocument({})}
        entries={[{ id: 'fundstelle-1', pageNumber: 4, title: 'Passage 1' }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Passage 1 S. 4' }));

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        resetScroll: false,
        search: expect.any(Function),
      }),
    );
    expect(
      navigateMock.mock.calls[0]?.[0].search({
        feedbackTargetId: 'fundstelle-feedback',
        selectedNormId: 'norm-1',
      }),
    ).toEqual({
      feedbackTargetId: 'fundstelle-feedback',
      selectedNormId: 'norm-1',
      previewDocumentId: 'document-1',
    });
    expect(openConnectedFileMock).toHaveBeenCalledWith('file-1');
    expect(jumpToConnectedFilePageMock).toHaveBeenCalledWith(4, 'file-1');
  });

  it('does not open or navigate when the document has no file id', async () => {
    const user = userEvent.setup();

    render(
      <FundstellenSelectedReferenceCard
        document={createDocument({ dms_file_id: undefined })}
        entries={[{ id: 'fundstelle-1', pageNumber: 4, title: '' }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'document.pdf' }));
    await user.click(screen.getByRole('button', { name: 'Ohne Titel S. 4' }));

    expect(navigateMock).not.toHaveBeenCalled();
    expect(openConnectedFileMock).not.toHaveBeenCalled();
    expect(jumpToConnectedFilePageMock).not.toHaveBeenCalled();
  });
});
