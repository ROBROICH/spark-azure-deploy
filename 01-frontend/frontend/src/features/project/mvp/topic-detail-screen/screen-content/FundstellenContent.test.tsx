import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FundstellenContent } from './FundstellenContent';

type SelectionResult =
  | { mode: 'empty'; isLoading: false }
  | { mode: 'document'; isLoading: false; fundstellenCards: unknown[] }
  | { mode: 'norm'; isLoading: false; fundstellenCards: unknown[] }
  | { mode: 'documentAndNorm'; isLoading: false; entries: unknown[] };

const { documentNormResultState, selectionResultState } = vi.hoisted<{
  documentNormResultState: { result: SelectionResult };
  selectionResultState: { result: SelectionResult };
}>(() => ({
  documentNormResultState: {
    result: {
      mode: 'documentAndNorm',
      isLoading: false,
      entries: [],
    },
  },
  selectionResultState: {
    result: { mode: 'empty', isLoading: false },
  },
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ topicName: 'topic-1', verfahrenId: 'project-1' }),
  }),
}));

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: () => [],
}));

vi.mock('@/db/nodes/hooks/useLiveNodes', () => ({
  useLiveNodes: () => ({ data: [] }),
}));

vi.mock('@/db/nodes/hooks/useGraphPerfDiagnostics', () => ({
  useGraphPerfReadyByKey: () => undefined,
}));

vi.mock('@/features/project/versioning/useProjectVersionsNavigation', () => ({
  useProjectVersionsNavigation: () => vi.fn(),
}));

vi.mock('./useMvpNormRefreshAction', () => ({
  useMvpNormRefreshAction: () => ({
    isRefreshDisabled: false,
    isRefreshRunning: false,
    onRefresh: vi.fn(),
  }),
}));

vi.mock('./useFundstellenSelectionResult', () => ({
  useFundstellenDocumentNormResult: () => documentNormResultState.result,
  useFundstellenDocumentResult: () => selectionResultState.result,
  useFundstellenNormResult: () => selectionResultState.result,
}));

vi.mock('./FundstellenDocumentGroupCard', () => ({
  FundstellenDocumentGroupCard: () => <div>document card</div>,
}));

vi.mock('./FundstellenNormGroupCard', () => ({
  FundstellenNormGroupCard: () => <div>norm card</div>,
}));

vi.mock('./FundstellenSelectedReferenceCard', () => ({
  FundstellenSelectedReferenceCard: () => <div>selected reference</div>,
}));

vi.mock('./FundstellenExplanation', () => ({
  FundstellenStateMessage: (props: { children: ReactNode }) => (
    <p>{props.children}</p>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const createDocument = (overrides: Partial<NodePayloadByType<'dokument'>>) =>
  ({
    id: 'document-1',
    dmsFileId: 'file-1',
    filename: 'folder/document-1.pdf',
    compositeKey: toCompositeKey({ id: 'document-1', nodeType: 'dokument' }),
    createdAt: '2026-04-02T00:00:00.000Z',
    documentId: null,
    documentType: null,
    frontendParentIds: [],
    isDeleted: false,
    isOutdated: false,
    isTocDocument: false,
    markdownTextId: 'markdown-text-1',
    mimeType: 'application/pdf',
    nodeType: 'dokument',
    pageCount: 1,
    projectId: 'project-1',
    projectVersion: 1,
    summary: '',
    updateType: 'automated',
    updatedAt: '2026-04-02T00:00:00.000Z',
    ...overrides,
  }) satisfies NodePayloadByType<'dokument'>;

const topicDocuments = [createDocument({})];

describe('FundstellenContent', () => {
  beforeEach(() => {
    selectionResultState.result = { mode: 'empty', isLoading: false };
    documentNormResultState.result = {
      mode: 'documentAndNorm',
      isLoading: false,
      entries: [],
    };
  });

  afterEach(cleanup);

  it('renders the empty selection call to action', () => {
    render(<FundstellenContent topicDocuments={topicDocuments} />);

    expect(
      screen.getByText('FundstellenTabContent.emptyStateCta'),
    ).toBeDefined();
  });

  it('renders document-only mode cards', () => {
    selectionResultState.result = {
      mode: 'document',
      isLoading: false,
      fundstellenCards: [{ normId: 'norm-1', entries: [] }],
    };

    render(
      <FundstellenContent
        selectedDocumentId="document-1"
        topicDocuments={topicDocuments}
      />,
    );

    expect(screen.getByText('norm card')).toBeDefined();
  });

  it('renders norm-only mode cards', () => {
    selectionResultState.result = {
      mode: 'norm',
      isLoading: false,
      fundstellenCards: [{ documentId: 'document-1', entries: [] }],
    };

    render(
      <FundstellenContent
        selectedNormId="norm-1"
        topicDocuments={topicDocuments}
      />,
    );

    expect(screen.getByText('document card')).toBeDefined();
  });

  it('renders selected document and norm intersection results', () => {
    documentNormResultState.result = {
      mode: 'documentAndNorm',
      isLoading: false,
      entries: [{ id: 'fundstelle-1', pageNumber: 1, title: 'Fundstelle' }],
    };

    render(
      <FundstellenContent
        selectedDocumentId="document-1"
        selectedNormId="norm-1"
        topicDocuments={topicDocuments}
      />,
    );

    expect(screen.getByText('selected reference')).toBeDefined();
  });
});
