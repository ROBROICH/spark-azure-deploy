import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RpbPdfPopoutScopeRegistration } from './RpbPdfPopoutScopeRegistration';

type RouteSearch = {
  previewDocumentId?: string;
  topicId?: string;
};

type RegisteredScope = {
  connectedFileId?: string;
  connectedFilePreview?: {
    isPdf: boolean;
    title: string;
  };
  onConnectedFileSelect: (projectDocumentId: string) => void;
  preferredDocumentFilter: 'all' | 'topic';
  projectId: string;
  scopeFileIds?: Set<string>;
  scopeKey: string;
  topicLabel?: string;
};

const routeState = vi.hoisted<{ search: RouteSearch }>(() => ({
  search: {
    previewDocumentId: 'document-1',
    topicId: 'topic-1',
  } satisfies RouteSearch,
}));

const mocks = vi.hoisted(() => ({
  cleanupScopeMock: vi.fn(),
  navigateMock: vi.fn(),
  registerScopeMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => mocks.navigateMock,
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
    useSearch: () => routeState.search,
  }),
}));

vi.mock('@/features/project/pdf-popout/PdfPopoutWorkspaceContext', async () => {
  const React = await import('react');

  return {
    useRegisterPdfPopoutScope: (scope: RegisteredScope) => {
      mocks.registerScopeMock(scope);
      React.useEffect(
        () => () => mocks.cleanupScopeMock(scope.scopeKey),
        [scope.scopeKey],
      );
    },
  };
});

vi.mock('@/db/nodes/hooks/useGraph', () => ({
  useGraph: () => ({
    getDescendants: (topicId: string) =>
      topicId === 'topic-1'
        ? [
            { id: 'document-1', node_type: 'dokument' },
            { id: 'document-2', node_type: 'dokument' },
            { id: 'satz-1', node_type: 'satz' },
          ]
        : [{ id: 'document-3', node_type: 'dokument' }],
    topics: [
      { id: 'topic-1', name: 'Topic One' },
      { id: 'topic-2', name: 'Topic Two' },
    ],
  }),
}));

vi.mock('@/db/nodes/hooks/useTopicNodes', () => ({
  useTopicNodes: () => ({
    data: [
      { id: 'topic-1', name: 'Topic One' },
      { id: 'topic-2', name: 'Topic Two' },
    ],
  }),
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNode: (nodeRef: { id: string; node_type: string } | null) => ({
    data:
      nodeRef?.id === 'document-1'
        ? {
            dms_file_id: 'file-1',
            filename: 'folder/preview.pdf',
            id: 'document-1',
            node_type: 'dokument',
          }
        : null,
  }),
  useNodes: (nodeRefs: { id: string; node_type: string }[]) => ({
    data: nodeRefs.map((nodeRef) => ({
      dms_file_id:
        nodeRef.id === 'document-1'
          ? 'file-1'
          : nodeRef.id === 'document-2'
            ? 'file-2'
            : 'file-3',
      filename: `${nodeRef.id}.pdf`,
      id: nodeRef.id,
      node_type: 'dokument',
    })),
  }),
}));

const latestRegisteredScope = () => {
  const scope = mocks.registerScopeMock.mock.lastCall?.[0] as
    | RegisteredScope
    | undefined;

  if (!scope) {
    throw new Error('Expected a registered PDF popout scope');
  }

  return scope;
};

describe('RpbPdfPopoutScopeRegistration', () => {
  beforeEach(() => {
    routeState.search = {
      previewDocumentId: 'document-1',
      topicId: 'topic-1',
    };
    mocks.cleanupScopeMock.mockReset();
    mocks.navigateMock.mockReset();
    mocks.registerScopeMock.mockReset();
  });

  afterEach(cleanup);

  it('registers a topic-scoped PDF popout context from route search and nodes', () => {
    render(<RpbPdfPopoutScopeRegistration />);

    const scope = latestRegisteredScope();
    expect(scope).toMatchObject({
      connectedFileId: 'file-1',
      connectedFilePreview: {
        isPdf: true,
        title: 'preview.pdf',
      },
      preferredDocumentFilter: 'topic',
      projectId: 'verfahren-1',
      scopeKey: 'rpb:verfahren-1:topic-1',
      topicLabel: 'Topic One',
    });
    expect(scope.scopeFileIds).toBeDefined();
    expect([...(scope.scopeFileIds ?? [])]).toEqual(['file-1', 'file-2']);
  });

  it('updates registration and cleans up the previous scope when topic state changes', () => {
    const { rerender, unmount } = render(<RpbPdfPopoutScopeRegistration />);

    routeState.search = {
      previewDocumentId: undefined,
      topicId: undefined,
    };
    rerender(<RpbPdfPopoutScopeRegistration />);

    expect(mocks.cleanupScopeMock).toHaveBeenCalledWith(
      'rpb:verfahren-1:topic-1',
    );
    expect(latestRegisteredScope()).toMatchObject({
      preferredDocumentFilter: 'all',
      scopeFileIds: undefined,
      scopeKey: 'rpb:verfahren-1:all',
      topicLabel: undefined,
    });

    unmount();

    expect(mocks.cleanupScopeMock).toHaveBeenCalledWith('rpb:verfahren-1:all');
  });

  it('writes the selected connected file back to route search and clears fundstellen', () => {
    render(<RpbPdfPopoutScopeRegistration />);

    latestRegisteredScope().onConnectedFileSelect('file-2');

    expect(mocks.navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      resetScroll: false,
    });

    const nextSearch = mocks.navigateMock.mock.calls[0]?.[0].search({
      previewDocumentId: 'document-1',
      selectedFundstelleId: 'fundstelle-1',
    });
    expect(nextSearch).toEqual({
      previewDocumentId: 'document-2',
      selectedFundstelleId: undefined,
    });
  });
});
