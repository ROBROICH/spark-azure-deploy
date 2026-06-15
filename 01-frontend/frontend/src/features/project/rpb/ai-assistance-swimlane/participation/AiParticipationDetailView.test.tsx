import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodeRef } from '@/db/nodes/types';
import type {
  RpbArgumentNode,
  RpbSubtopicNode,
} from './rpbParticipationArguments';
import { AiParticipationDetailView } from './AiParticipationDetailView';

type RouteSearch = {
  participationSubtopicId?: string;
  topicId?: string;
};

const routeState = vi.hoisted<{ search: RouteSearch }>(() => ({
  search: {
    participationSubtopicId: 'subtopic-1',
    topicId: 'topic-1',
  } satisfies RouteSearch,
}));

const mocks = vi.hoisted(() => ({
  argumentsById: new Map<string, RpbArgumentNode>(),
  canMutateTopic: true,
  descendantArgumentsByParentId: new Map<string, RpbArgumentNode[]>(),
  descendantRefsByStartAndType: new Map<string, NodeRef[]>(),
  subtopicsById: new Map<string, RpbSubtopicNode>(),
  transactMock: vi.fn((callback: () => void) => callback()),
  updateMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
    useSearch: () => routeState.search,
  }),
  Link: (
    props: ComponentProps<'a'> & {
      params?: unknown;
      resetScroll?: boolean;
      search?: unknown;
      to?: string;
    },
  ) => {
    const {
      children,
      params: _params,
      resetScroll: _resetScroll,
      search: _search,
      to: _to,
      ...anchorProps
    } = props;

    return <a {...anchorProps}>{children}</a>;
  },
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => options.count * options.estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        key: index,
        start: index * options.estimateSize(),
      })),
    measureElement: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (!options) {
        return key;
      }

      return `${key}(${JSON.stringify(options)})`;
    },
  }),
}));

vi.mock(
  '@/features/access-control/topic-permissions/hasTopicMutationRights',
  () => ({
    useHasTopicMutationRights: () => () => mocks.canMutateTopic,
  }),
);

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    transact: mocks.transactMock,
    update: mocks.updateMock,
  }),
}));

vi.mock('@/db/nodes/hooks/useDescendantNodes', () => ({
  useDescendantNodes: (_nodeType: string, parentRef: NodeRef | null) => ({
    data: parentRef
      ? (mocks.descendantArgumentsByParentId.get(parentRef.id) ?? [])
      : [],
  }),
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNode: (ref: NodeRef) => ({
    data: mocks.subtopicsById.get(ref.id),
  }),
  useNodes: (refs: NodeRef[]) => ({
    data: refs.flatMap((ref) => {
      const argument = mocks.argumentsById.get(ref.id);

      return argument ? [argument] : [];
    }),
  }),
}));

vi.mock('@/db/nodes/hooks/useGraph', () => ({
  useGraph: () => ({ index: {} }),
}));

vi.mock('@/db/nodes/examinationGraphModel', () => ({
  getDescendantNodeRefsByType: (
    _index: unknown,
    startId: string,
    nodeType: string,
  ) => mocks.descendantRefsByStartAndType.get(`${startId}:${nodeType}`) ?? [],
}));

vi.mock('@/features/ui/button/Button', () => ({
  Button: (props: ComponentProps<'button'> & { asChild?: boolean }) => (
    <button type="button" aria-label={props['aria-label']}>
      {props.children}
    </button>
  ),
}));

vi.mock('@/features/ui/ai-suggestion-badge/AiSuggestionBadge', () => ({
  AiSuggestionBadge: () => <span>ai</span>,
}));

vi.mock('@/features/ui/cards/argument-card/ArgumentCard', () => ({
  ArgumentCard: (props: ComponentProps<'article'>) => (
    <article>{props.children}</article>
  ),
  ArgumentCardBadge: (props: ComponentProps<'div'>) => (
    <div>{props.children}</div>
  ),
  ArgumentCardBody: (props: ComponentProps<'div'>) => (
    <div>{props.children}</div>
  ),
  ArgumentCardFooter: (props: ComponentProps<'div'>) => (
    <div>{props.children}</div>
  ),
  ArgumentCardHeader: (props: ComponentProps<'div'>) => (
    <div>{props.children}</div>
  ),
  ArgumentCardTitle: (props: ComponentProps<'div'>) => (
    <div>{props.children}</div>
  ),
}));

vi.mock('../shared/AiTopicHeader', () => ({
  AiTopicHeader: (props: { leading?: ReactNode; titleKey: string }) => (
    <header>
      {props.leading}
      {props.titleKey}
    </header>
  ),
}));

const argument = (overrides: Partial<RpbArgumentNode>): RpbArgumentNode =>
  ({
    argument_id: 'A1',
    beteiligungs_eingang_id: 'entry-1',
    compositeKey: toCompositeKey({
      id: overrides.id ?? 'argument-1',
      node_type: 'argument',
    }),
    context: null,
    context_end_idx: null,
    context_start_idx: null,
    created_at: '2026-01-01T00:00:00.000Z',
    einordnung: null,
    end_idx: null,
    erwiderung: null,
    frontend_parent_ids: [],
    id: 'argument-1',
    in_vae: false,
    is_deleted: false,
    is_valid_argument: true,
    node_type: 'argument',
    project_id: 'project-1',
    start_idx: null,
    status: 'open',
    sub_topic_id: 'subtopic-1',
    sys_period: null,
    text: 'Argument text',
    topic_id: 'topic-1',
    update_type: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) satisfies RpbArgumentNode;

const subtopic = (overrides: Partial<RpbSubtopicNode>): RpbSubtopicNode =>
  ({
    compositeKey: toCompositeKey({
      id: overrides.id ?? 'subtopic-1',
      node_type: 'subtopic',
    }),
    created_at: '2026-01-01T00:00:00.000Z',
    description: null,
    frontend_parent_ids: [],
    id: 'subtopic-1',
    is_deleted: false,
    name: 'Artenschutz',
    node_type: 'subtopic',
    project_id: 'project-1',
    show_in_beschluss: false,
    show_in_ewm: false,
    show_in_mvp: false,
    sys_period: null,
    topic_id: 'topic-1',
    update_type: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) satisfies RpbSubtopicNode;

describe('AiParticipationDetailView', () => {
  afterEach(cleanup);

  beforeEach(() => {
    routeState.search = {
      participationSubtopicId: 'subtopic-1',
      topicId: 'topic-1',
    };
    mocks.canMutateTopic = true;
    mocks.argumentsById = new Map();
    mocks.descendantArgumentsByParentId = new Map([
      [
        'subtopic-1',
        [
          argument({
            argument_id: 'A2',
            id: 'argument-2',
            text: 'Second selected argument',
          }),
          argument({
            argument_id: 'A1',
            id: 'argument-1',
            text: 'First selected argument',
          }),
        ],
      ],
    ]);
    mocks.descendantRefsByStartAndType = new Map();
    mocks.subtopicsById = new Map([
      ['subtopic-1', subtopic({ id: 'subtopic-1', name: 'Artenschutz' })],
    ]);
    mocks.transactMock.mockClear();
    mocks.updateMock.mockClear();
  });

  it('renders arguments for the selected real subtopic', () => {
    render(<AiParticipationDetailView />);

    expect(screen.getByText('Artenschutz')).toBeInTheDocument();
    expect(screen.getByText('First selected argument')).toBeInTheDocument();
    expect(screen.getByText('Second selected argument')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders the empty state when the selected subtopic has no arguments', () => {
    mocks.descendantArgumentsByParentId = new Map([['subtopic-1', []]]);

    render(<AiParticipationDetailView />);

    expect(
      screen.getByText('aiAssistance.participationNoArgumentsForSubtopic'),
    ).toBeInTheDocument();
  });

  it('renders only unassigned argument refs for the Sonstige detail', () => {
    routeState.search = {
      participationSubtopicId: '__sonstige__',
      topicId: 'topic-1',
    };
    const unassignedArgument = argument({
      id: 'argument-unassigned',
      sub_topic_id: null,
      text: 'Unassigned argument',
    });
    const assignedArgument = argument({
      id: 'argument-assigned',
      sub_topic_id: 'subtopic-1',
      text: 'Assigned argument',
    });
    mocks.argumentsById = new Map([
      [unassignedArgument.id, unassignedArgument],
      [assignedArgument.id, assignedArgument],
    ]);
    mocks.descendantRefsByStartAndType = new Map([
      [
        'topic-1:argument',
        [
          { id: unassignedArgument.id, node_type: 'argument' },
          { id: assignedArgument.id, node_type: 'argument' },
        ],
      ],
      ['topic-1:subtopic', [{ id: 'subtopic-1', node_type: 'subtopic' }]],
      [
        'subtopic-1:argument',
        [{ id: assignedArgument.id, node_type: 'argument' }],
      ],
    ]);

    render(<AiParticipationDetailView />);

    expect(screen.getByText('Unassigned argument')).toBeInTheDocument();
    expect(screen.queryByText('Assigned argument')).not.toBeInTheDocument();
  });

  it('wires valid argument actions through useAction', async () => {
    render(<AiParticipationDetailView />);

    const statusButton = screen
      .getAllByRole('button', {
        name: /aiAssistance\.participationDetailStatus\.addToBeschluss/,
      })
      .at(0);
    expect(statusButton).toBeDefined();
    await userEvent.click(statusButton as HTMLElement);

    expect(mocks.transactMock).toHaveBeenCalledTimes(1);
    expect(mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'argument-1' }),
      expect.any(Function),
    );
  });

  it('disables real-subtopic argument actions when route topic and subtopic owner diverge', async () => {
    routeState.search = {
      participationSubtopicId: 'subtopic-1',
      topicId: 'topic-2',
    };

    render(<AiParticipationDetailView />);

    const statusButton = screen.getAllByRole('button', {
      name: /aiAssistance\.participationDetailStatus\.addToBeschluss/,
    })[0] as HTMLElement | undefined;
    expect(statusButton).toBeDefined();

    expect(statusButton).toBeDisabled();

    await userEvent.click(statusButton as HTMLElement);

    expect(mocks.transactMock).not.toHaveBeenCalled();
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });
});
