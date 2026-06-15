import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiAssistanceSwimlane } from './AiAssistanceSwimlane';

type RouteSearch = {
  aiLane?: 'risikohinweise';
  aiOverviewSection?: 'rechtsgrundlage' | 'beteiligungseingaenge' | 'documents';
  lawChangeId?: string;
  outlineNodeId?: string;
  participationSubtopicId?: string;
  satzId?: string;
  rechtsmethodikSatzId?: string;
  showNormtext?: boolean;
  topicId?: string;
  topicNormId?: string;
};

const routeState = vi.hoisted<{ search: RouteSearch }>(() => ({
  search: {} satisfies RouteSearch,
}));

const mocks = vi.hoisted(() => ({
  lawChangeDialogControllerMock: vi.fn(),
  navigateMock: vi.fn(),
  useNodesByTypeMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
    useSearch: (options?: { select?: (search: RouteSearch) => unknown }) =>
      options?.select ? options.select(routeState.search) : routeState.search,
    useNavigate: () => mocks.navigateMock,
    useLoaderData: () => ({ db: {} }),
  }),
}));

vi.mock('@/db/nodes/hooks/useNodesByType', () => ({
  useNodesByType: (nodeType: string) => mocks.useNodesByTypeMock(nodeType),
}));

vi.mock('../workspace-state/RpbOutlineContext', () => ({
  useRpbVaeNodeUrlState: () => {
    const { data: vaeNodes } = mocks.useNodesByTypeMock('vae_node');
    const selectedVaeNode =
      vaeNodes.find(
        (vaeNode: { id: string }) =>
          vaeNode.id === routeState.search.outlineNodeId,
      ) ??
      vaeNodes[0] ??
      null;

    return {
      onVaeNodeSelect: vi.fn(),
      selectedTopicId: routeState.search.topicId,
      selectedVaeNode,
      selectedVaeNodeAssignedTopicId: selectedVaeNode?.topic_id ?? undefined,
      selectedVaeNodeMutationTopicId: selectedVaeNode
        ? (selectedVaeNode.topic_id ?? null)
        : undefined,
      selectedVaeNodeId: selectedVaeNode?.id ?? '',
    };
  },
}));

vi.mock('./risk-warnings/AiRiskWarningsEntry', () => ({
  AiRiskWarningsEntry: () => <div>risk-warnings-entry</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./participation/AiParticipationDetailView', () => ({
  AiParticipationDetailView: () => <div>participation-detail-view</div>,
}));

vi.mock('./rechtsgrundlage/AiNormDetailView', () => ({
  AiNormDetailView: () => <div>norm-detail-view</div>,
}));

vi.mock('./rechtsgrundlage/AiNormtextView', () => ({
  AiNormtextView: () => <div>normtext-view</div>,
}));

vi.mock('./ai-rating/AiSatzBewertungDetailView', () => ({
  AiSatzBewertungDetailView: () => <div>satz-bewertung-detail-view</div>,
}));

vi.mock('./ai-rating/rechtsmethodik/AiSatzDetailView', () => ({
  AiSatzDetailView: () => <div>satz-detail-view</div>,
}));

vi.mock('./shared/AiTopicHeader', () => ({
  AiTopicHeader: (props: { allowEmptyTopicSelection?: boolean }) => (
    <header data-allow-empty-topic={String(props.allowEmptyTopicSelection)}>
      topic-header
    </header>
  ),
}));

vi.mock('./AiAssistanceSwimlaneSkeleton', () => ({
  AiAssistanceSwimlaneSkeleton: () => <div>skeleton</div>,
}));

vi.mock('./documents/AiDocumentsSection', () => ({
  AiDocumentsSection: () => <div>documents-section</div>,
}));

vi.mock('./rechtsgrundlage/AiLegalBasisSection', () => ({
  AiLegalBasisSection: () => <div>legal-basis-section</div>,
}));

vi.mock('./participation/AiParticipationSection', () => ({
  AiParticipationSection: () => <div>participation-section</div>,
}));

vi.mock('@/features/ui/accordion/Accordion', () => ({
  Accordion: (props: {
    children: ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <div data-testid="overview-accordion" data-value={props.value}>
      <button
        type="button"
        onClick={() => props.onValueChange?.('beteiligungseingaenge')}
      >
        open participation
      </button>
      <button type="button" onClick={() => props.onValueChange?.('documents')}>
        open documents
      </button>
      <button type="button" onClick={() => props.onValueChange?.('')}>
        close section
      </button>
      {props.children}
    </div>
  ),
}));

vi.mock('@/features/ui/ai/AiSparklesChip', () => ({
  AiSparklesChip: () => <span>AI</span>,
}));

vi.mock('@/features/project/law-changes/ui/LawChangeDialogController', () => ({
  LawChangeDialogController: (props: {
    lawChangeId?: string;
    onOpenChange: (open: boolean) => void;
    onSelectLawChangeId: (lawChangeId: string) => void;
  }) => {
    mocks.lawChangeDialogControllerMock(props);

    return (
      <div data-testid="law-change-dialog">
        <button type="button" onClick={() => props.onOpenChange(false)}>
          close law change
        </button>
        <button
          type="button"
          onClick={() => props.onSelectLawChangeId('law-change-2')}
        >
          select law change
        </button>
      </div>
    );
  },
}));

describe('AiAssistanceSwimlane', () => {
  afterEach(cleanup);

  beforeEach(() => {
    routeState.search = {};
    mocks.navigateMock.mockReset();
    mocks.lawChangeDialogControllerMock.mockReset();
    mocks.useNodesByTypeMock.mockReset();
    mocks.useNodesByTypeMock.mockReturnValue({
      data: [
        {
          checked_by_assignee: false,
          checked_by_leader: false,
          id: 'topic-root',
          is_deleted: false,
          is_hidden: false,
          order: 1,
          parent_vae_node_id: null,
          title: 'Topic Root',
          topic_id: 'topic-1',
        },
        {
          checked_by_assignee: false,
          checked_by_leader: false,
          id: 'topicless-root',
          is_deleted: false,
          is_hidden: false,
          order: 2,
          parent_vae_node_id: null,
          title: 'Topicless Root',
          topic_id: null,
        },
      ],
    });
    mocks.navigateMock.mockImplementation(
      (options: { search?: (prev: RouteSearch) => RouteSearch }) => {
        if (options.search) {
          routeState.search = options.search(routeState.search);
        }
      },
    );
  });

  it('renders the overview when no detail param is set', () => {
    render(<AiAssistanceSwimlane />);

    expect(screen.getByText('participation-section')).toBeInTheDocument();
    expect(screen.getByText('risk-warnings-entry')).toBeInTheDocument();
    expect(
      screen.queryByText('participation-detail-view'),
    ).not.toBeInTheDocument();
  });

  it('shows only the no-topic hint and risk warnings for a selected no-topic outline without manual topic', () => {
    routeState.search = { outlineNodeId: 'topicless-root' };

    render(<AiAssistanceSwimlane />);

    expect(
      screen.getByText('aiAssistance.noAssignedTopicHint'),
    ).toBeInTheDocument();
    expect(screen.getByText('risk-warnings-entry')).toBeInTheDocument();
    expect(screen.queryByText('legal-basis-section')).not.toBeInTheDocument();
    expect(screen.queryByText('documents-section')).not.toBeInTheDocument();
    expect(screen.queryByText('participation-section')).not.toBeInTheDocument();
    expect(screen.getByText('topic-header')).toHaveAttribute(
      'data-allow-empty-topic',
      'true',
    );
  });

  it('uses the normalized default outline selection for no-topic overview state', () => {
    mocks.useNodesByTypeMock.mockReturnValue({
      data: [
        {
          checked_by_assignee: false,
          checked_by_leader: false,
          id: 'topicless-root',
          is_deleted: false,
          is_hidden: false,
          order: 1,
          parent_vae_node_id: null,
          title: 'Topicless Root',
          topic_id: null,
        },
      ],
    });

    render(<AiAssistanceSwimlane />);

    expect(
      screen.getByText('aiAssistance.noAssignedTopicHint'),
    ).toBeInTheDocument();
    expect(screen.queryByText('legal-basis-section')).not.toBeInTheDocument();
    expect(screen.getByText('topic-header')).toHaveAttribute(
      'data-allow-empty-topic',
      'true',
    );
  });

  it('shows informational topic sections after manually selecting a topic on a no-topic outline', () => {
    routeState.search = {
      outlineNodeId: 'topicless-root',
      topicId: 'topic-1',
    };

    render(<AiAssistanceSwimlane />);

    expect(
      screen.getByText('aiAssistance.noAssignedTopicHint'),
    ).toBeInTheDocument();
    expect(screen.getByText('legal-basis-section')).toBeInTheDocument();
    expect(screen.getByText('documents-section')).toBeInTheDocument();
    expect(screen.getByText('participation-section')).toBeInTheDocument();
    expect(screen.getByText('risk-warnings-entry')).toBeInTheDocument();
  });

  it('keeps the regular overview for a topic-backed selected outline', () => {
    routeState.search = {
      outlineNodeId: 'topic-root',
      topicId: 'topic-1',
    };

    render(<AiAssistanceSwimlane />);

    expect(
      screen.queryByText('aiAssistance.noAssignedTopicHint'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('legal-basis-section')).toBeInTheDocument();
    expect(screen.getByText('documents-section')).toBeInTheDocument();
    expect(screen.getByText('participation-section')).toBeInTheDocument();
    expect(screen.getByText('topic-header')).toHaveAttribute(
      'data-allow-empty-topic',
      'false',
    );
  });

  it('renders participation detail view when participationSubtopicId is set', () => {
    routeState.search = { participationSubtopicId: '__sonstige__' };

    render(<AiAssistanceSwimlane />);

    expect(screen.getByText('participation-detail-view')).toBeInTheDocument();
    expect(screen.queryByText('participation-section')).not.toBeInTheDocument();
  });

  it('participationSubtopicId branch takes precedence over topicNormId', () => {
    routeState.search = {
      participationSubtopicId: '__sonstige__',
      topicNormId: 'topic-norm-1',
    };

    render(<AiAssistanceSwimlane />);

    expect(screen.getByText('participation-detail-view')).toBeInTheDocument();
    expect(screen.queryByText('norm-detail-view')).not.toBeInTheDocument();
  });

  it('renders norm detail view when topicNormId is set without participationSubtopicId', () => {
    routeState.search = { topicNormId: 'topic-norm-1' };

    render(<AiAssistanceSwimlane />);

    expect(screen.getByText('norm-detail-view')).toBeInTheDocument();
    expect(screen.getByTestId('law-change-dialog')).toBeInTheDocument();
    expect(
      screen.queryByText('participation-detail-view'),
    ).not.toBeInTheDocument();
  });

  it('clears lawChangeId when the law-change dialog closes', async () => {
    const user = userEvent.setup();
    routeState.search = {
      lawChangeId: 'law-change-1',
      topicNormId: 'topic-norm-1',
    };

    render(<AiAssistanceSwimlane />);

    await user.click(screen.getByRole('button', { name: 'close law change' }));

    expect(mocks.navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      replace: true,
      resetScroll: false,
    });
    expect(routeState.search).toEqual({
      lawChangeId: undefined,
      topicNormId: 'topic-norm-1',
    });
  });

  it('replaces lawChangeId when the law-change dialog selects another item', async () => {
    const user = userEvent.setup();
    routeState.search = {
      lawChangeId: 'law-change-1',
      topicNormId: 'topic-norm-1',
    };

    render(<AiAssistanceSwimlane />);

    await user.click(screen.getByRole('button', { name: 'select law change' }));

    expect(mocks.navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      replace: true,
      resetScroll: false,
    });
    expect(routeState.search).toEqual({
      lawChangeId: 'law-change-2',
      topicNormId: 'topic-norm-1',
    });
  });

  it('renders norm text view when topicNormId and showNormtext are set', () => {
    routeState.search = { showNormtext: true, topicNormId: 'topic-norm-1' };

    render(<AiAssistanceSwimlane />);

    expect(screen.getByText('normtext-view')).toBeInTheDocument();
    expect(screen.getByTestId('law-change-dialog')).toBeInTheDocument();
    expect(screen.queryByText('norm-detail-view')).not.toBeInTheDocument();
  });

  it('renders bewertung detail view when satzId is set', () => {
    routeState.search = { satzId: 'satz-1' };

    render(<AiAssistanceSwimlane />);

    expect(screen.getByText('satz-bewertung-detail-view')).toBeInTheDocument();
    expect(screen.queryByText('norm-detail-view')).not.toBeInTheDocument();
  });

  it('renders rechtsmethodik detail view when rechtsmethodikSatzId is set', () => {
    routeState.search = { rechtsmethodikSatzId: 'satz-1' };

    render(<AiAssistanceSwimlane />);

    expect(screen.getByText('satz-detail-view')).toBeInTheDocument();
    expect(screen.getByTestId('law-change-dialog')).toBeInTheDocument();
    expect(screen.queryByText('norm-detail-view')).not.toBeInTheDocument();
  });

  it('does not reopen Rechtsgrundlage when closing another overview section', async () => {
    const user = userEvent.setup();

    const { rerender } = render(<AiAssistanceSwimlane />);

    expect(screen.getByTestId('overview-accordion')).toHaveAttribute(
      'data-value',
      'rechtsgrundlage',
    );

    await user.click(
      screen.getByRole('button', { name: 'open participation' }),
    );
    rerender(<AiAssistanceSwimlane />);

    expect(screen.getByTestId('overview-accordion')).toHaveAttribute(
      'data-value',
      'beteiligungseingaenge',
    );

    await user.click(screen.getByRole('button', { name: 'close section' }));
    rerender(<AiAssistanceSwimlane />);

    expect(screen.getByTestId('overview-accordion')).toHaveAttribute(
      'data-value',
      '',
    );
  });

  it('does not reopen Rechtsgrundlage when closing Unterlagen', async () => {
    const user = userEvent.setup();

    const { rerender } = render(<AiAssistanceSwimlane />);

    await user.click(screen.getByRole('button', { name: 'open documents' }));
    rerender(<AiAssistanceSwimlane />);

    expect(screen.getByTestId('overview-accordion')).toHaveAttribute(
      'data-value',
      'documents',
    );

    await user.click(screen.getByRole('button', { name: 'close section' }));
    rerender(<AiAssistanceSwimlane />);

    expect(screen.getByTestId('overview-accordion')).toHaveAttribute(
      'data-value',
      '',
    );
  });

  it('reopens the default Rechtsgrundlage section when the selected topic changes', async () => {
    const user = userEvent.setup();

    routeState.search = { topicId: 'topic-1' };
    const { rerender } = render(<AiAssistanceSwimlane />);

    // Collapse the default section in-session.
    await user.click(screen.getByRole('button', { name: 'close section' }));
    rerender(<AiAssistanceSwimlane />);
    expect(screen.getByTestId('overview-accordion')).toHaveAttribute(
      'data-value',
      '',
    );

    // Switching to a different topic resets the in-session collapse so the
    // default section opens again (this used to rely on a keyed remount).
    routeState.search = { topicId: 'topic-2' };
    rerender(<AiAssistanceSwimlane />);

    expect(screen.getByTestId('overview-accordion')).toHaveAttribute(
      'data-value',
      'rechtsgrundlage',
    );
  });
});
