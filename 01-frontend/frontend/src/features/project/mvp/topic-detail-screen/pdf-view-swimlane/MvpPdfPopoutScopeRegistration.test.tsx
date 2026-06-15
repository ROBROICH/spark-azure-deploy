import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MvpPdfPopoutScopeRegistration } from './MvpPdfPopoutScopeRegistration';

type RouteSearch = {
  previewDocumentId?: string;
  selectedNormId?: string;
};

const { navigateMock, registeredScopeMock, routeState, useLiveNodeMock } =
  vi.hoisted(() => ({
    navigateMock: vi.fn(),
    registeredScopeMock: vi.fn(),
    routeState: {
      search: {} satisfies RouteSearch,
    },
    useLiveNodeMock: vi.fn(),
  }));

vi.mock('@/db/nodes/hooks/useLiveNodes', () => ({
  useLiveNode: useLiveNodeMock,
}));

vi.mock('@/features/project/pdf-popout/PdfPopoutWorkspaceContext', () => ({
  useRegisterPdfPopoutScope: registeredScopeMock,
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => navigateMock,
    useParams: () => ({ topicName: 'topic-1', verfahrenId: 'project-1' }),
    useSearch: ({ select }: { select: (search: RouteSearch) => unknown }) =>
      select(routeState.search),
  }),
}));

const createDocument = (
  id: string,
  dmsFileId: string,
  filename = `${id}.pdf`,
) =>
  ({
    id,
    dms_file_id: dmsFileId,
    filename,
    compositeKey: toCompositeKey({ id, node_type: 'dokument' }),
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
  }) satisfies NodePayloadByType<'dokument'>;

describe('MvpPdfPopoutScopeRegistration', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    registeredScopeMock.mockReset();
    routeState.search = {};
    useLiveNodeMock.mockReset();
    useLiveNodeMock.mockImplementation((ref: { id: string } | null) => {
      if (ref?.id === 'topic-1') {
        return { data: { id: 'topic-1', name: 'Topic One' } };
      }

      if (ref?.id === 'document-1') {
        return {
          data: createDocument('document-1', 'file-1', 'folder/document-1.pdf'),
        };
      }

      if (ref?.id === 'external-document') {
        return {
          data: createDocument(
            'external-document',
            'external-file',
            'external.pdf',
          ),
        };
      }

      return { data: null };
    });
  });

  afterEach(cleanup);

  it('registers only topic document files in the PDF popout scope', () => {
    routeState.search = { previewDocumentId: 'document-1' };

    render(
      <MvpPdfPopoutScopeRegistration
        topicDocuments={[createDocument('document-1', 'file-1')]}
      />,
    );

    expect(registeredScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectedFileId: 'file-1',
        connectedFilePreview: {
          isPdf: true,
          title: 'document-1.pdf',
        },
        preferredDocumentFilter: 'topic',
        projectId: 'project-1',
        scopeKey: 'mvp:project-1:topic-1',
        topicLabel: 'Topic One',
      }),
    );
    expect(
      Array.from(registeredScopeMock.mock.calls[0]?.[0].scopeFileIds),
    ).toEqual(['file-1']);
  });

  it('does not connect an off-topic preview document', () => {
    routeState.search = {
      previewDocumentId: 'external-document',
      selectedNormId: 'norm-1',
    };

    render(
      <MvpPdfPopoutScopeRegistration
        topicDocuments={[createDocument('document-1', 'file-1')]}
      />,
    );

    expect(registeredScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectedFileId: undefined,
        connectedFilePreview: undefined,
      }),
    );
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ replace: true, resetScroll: false }),
    );
    expect(navigateMock.mock.calls[0]?.[0].search(routeState.search)).toEqual({
      previewDocumentId: undefined,
      selectedNormId: 'norm-1',
    });
  });

  it('maps popout file selection back to topic document route ids only', () => {
    routeState.search = { previewDocumentId: 'document-1' };

    render(
      <MvpPdfPopoutScopeRegistration
        topicDocuments={[
          createDocument('document-1', 'file-1'),
          createDocument('document-2', 'file-2'),
        ]}
      />,
    );

    const onConnectedFileSelect =
      registeredScopeMock.mock.calls[0]?.[0].onConnectedFileSelect;

    onConnectedFileSelect('file-2');
    onConnectedFileSelect('external-file');

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(
      navigateMock.mock.calls[0]?.[0].search({ selectedNormId: 'norm-1' }),
    ).toEqual({
      selectedNormId: 'norm-1',
      previewDocumentId: 'document-2',
    });
    expect(navigateMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ replace: true, resetScroll: false }),
    );
  });
});
