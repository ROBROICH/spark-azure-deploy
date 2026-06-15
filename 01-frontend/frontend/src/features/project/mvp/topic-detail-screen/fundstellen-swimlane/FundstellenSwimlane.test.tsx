import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FundstellenSwimlane } from './FundstellenSwimlane';

type RouteSearch = {
  selectedDocumentId?: string;
  selectedNormId?: string;
};

const {
  contentPropsMock,
  navigateMock,
  refreshActionMock,
  routeState,
  showVersionsMock,
} = vi.hoisted(() => ({
  contentPropsMock: vi.fn(),
  navigateMock: vi.fn(),
  refreshActionMock: vi.fn(),
  routeState: {
    search: {} satisfies RouteSearch,
  },
  showVersionsMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => navigateMock,
    useParams: () => ({ selectedNormId: 'norm-1', verfahrenId: 'project-1' }),
    useSearch: ({ select }: { select: (search: RouteSearch) => unknown }) =>
      select(routeState.search),
  }),
}));

vi.mock('@/db/nodes/hooks/useLiveNodes', () => ({
  useLiveNode: (ref: { id: string; node_type: string } | null) => {
    if (ref?.node_type === 'norm') {
      return {
        data: {
          id: ref.id,
          gesetz_id: 'gesetz-1',
          paragraph_nr: '44',
          paragraph_titel: 'Artenschutz',
        },
      };
    }

    if (ref?.node_type === 'gesetz') {
      return { data: { id: ref.id, jurabk: 'BNatSchG' } };
    }

    return { data: null };
  },
}));

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: () => [
    { id: 'fundstelle-1', node_type: 'fundstelle', is_outdated: true },
  ],
}));

vi.mock('@/features/project/versioning/outdatedSummary', () => ({
  hasOutdatedNodeSummary: () => true,
}));

vi.mock('@/features/project/versioning/useProjectVersionsNavigation', () => ({
  useProjectVersionsNavigation: () => showVersionsMock,
}));

vi.mock('@/features/ui/ai-outdated-trigger-card/AiOutdatedTriggerCard', () => ({
  AiOutdatedTriggerCard: (props: {
    refreshAction: { onClick: () => void };
    title: string;
    versionAction: { onClick: () => void };
  }) => (
    <div>
      <span>{props.title}</span>
      <button type="button" onClick={props.refreshAction.onClick}>
        refresh
      </button>
      <button type="button" onClick={props.versionAction.onClick}>
        versions
      </button>
    </div>
  ),
}));

vi.mock('../screen-content/useMvpNormRefreshAction', () => ({
  useMvpNormRefreshAction: () => ({
    isRefreshDisabled: false,
    isRefreshRunning: false,
    onRefresh: refreshActionMock,
  }),
}));

vi.mock('../screen-content/FundstellenContent', () => ({
  FundstellenContent: (props: Record<string, unknown>) => {
    contentPropsMock(props);

    return <div data-testid="fundstellen-content" />;
  },
}));

vi.mock('../screen-content/fundstellenLabels', () => ({
  getNormSelectionLabel: () => '§ 44 BNatSchG Artenschutz',
}));

vi.mock('../screen-content/FundstellenExplanation', () => ({
  FundstellenExplanation: (props: {
    selection:
      | { mode: 'empty' }
      | { mode: 'document'; documentLabel: string }
      | { mode: 'norm'; normLabel: string }
      | { mode: 'documentAndNorm'; documentLabel: string; normLabel: string };
    onClearDocument: () => void;
    onClearNorm: () => void;
  }) => (
    <div>
      <span>
        {'documentLabel' in props.selection
          ? props.selection.documentLabel
          : null}
      </span>
      <span>
        {'normLabel' in props.selection ? props.selection.normLabel : null}
      </span>
      <button type="button" onClick={props.onClearDocument}>
        clear document
      </button>
      <button type="button" onClick={props.onClearNorm}>
        clear norm
      </button>
    </div>
  ),
}));

vi.mock('@/features/ui/tooltip/TooltipWrapper', () => ({
  TooltipWrapper: (props: { children: ReactNode }) => <>{props.children}</>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const createDocument = (overrides: Partial<NodePayloadByType<'dokument'>>) =>
  ({
    id: 'document-1',
    dms_file_id: 'file-1',
    filename: 'folder/document-1.pdf',
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

const topicDocuments = [createDocument({})];

describe('FundstellenSwimlane', () => {
  beforeEach(() => {
    contentPropsMock.mockReset();
    navigateMock.mockReset();
    refreshActionMock.mockReset();
    routeState.search = {};
    showVersionsMock.mockReset();
  });

  afterEach(cleanup);

  it('clears document and norm selections through replacement route writes', async () => {
    const user = userEvent.setup();
    routeState.search = {
      selectedDocumentId: 'document-1',
      selectedNormId: 'norm-1',
    };

    render(<FundstellenSwimlane topicDocuments={topicDocuments} />);

    expect(contentPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedDocumentId: 'document-1',
        selectedNormId: 'norm-1',
        topicDocuments,
      }),
    );

    await user.click(screen.getByRole('button', { name: 'clear document' }));
    await user.click(screen.getByRole('button', { name: 'clear norm' }));

    expect(navigateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ replace: true, resetScroll: false }),
    );
    expect(
      navigateMock.mock.calls[0]?.[0].search({
        selectedDocumentId: 'document-1',
        selectedNormId: 'norm-1',
      }),
    ).toEqual({
      selectedDocumentId: undefined,
      selectedNormId: 'norm-1',
    });
    expect(
      navigateMock.mock.calls[1]?.[0].search({
        selectedDocumentId: 'document-1',
        selectedNormId: 'norm-1',
      }),
    ).toEqual({
      selectedDocumentId: 'document-1',
      selectedNormId: undefined,
    });
  });

  it('shows the outdated trigger for stale selected-norm fundstellen', async () => {
    const user = userEvent.setup();
    routeState.search = { selectedNormId: 'norm-1' };

    render(<FundstellenSwimlane topicDocuments={topicDocuments} />);

    expect(screen.getByText('FundstellenOutdatedTrigger.title')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'refresh' }));
    await user.click(screen.getByRole('button', { name: 'versions' }));

    expect(refreshActionMock).toHaveBeenCalledTimes(1);
    expect(showVersionsMock).toHaveBeenCalledTimes(1);
  });
});
