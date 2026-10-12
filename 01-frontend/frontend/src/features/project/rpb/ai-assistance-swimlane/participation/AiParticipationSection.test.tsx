import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeRef } from '@/db/nodes/types';
import type { RpbSubtopicNode } from './rpbParticipationArguments';
import { AiParticipationSection } from './AiParticipationSection';

type RouteSearch = {
  topicId?: string;
};

const routeState = vi.hoisted<{ search: RouteSearch }>(() => ({
  search: { topicId: 'topic-1' } satisfies RouteSearch,
}));

function createArgumentRef(id: string): NodeRef {
  return {
    id,
    nodeType: 'argument',
  } satisfies NodeRef;
}

function createDescendantsByStartAndType(): Record<string, NodeRef[]> {
  return {
    'topic-1:argument': [
      createArgumentRef('argument-1'),
      createArgumentRef('argument-2'),
      createArgumentRef('argument-3'),
    ],
    'subtopic-a:argument': [],
    'subtopic-b:argument': [createArgumentRef('argument-2')],
    'subtopic-c:argument': [],
  };
}

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  argumentRefs: [
    createArgumentRef('argument-1'),
    createArgumentRef('argument-2'),
    createArgumentRef('argument-3'),
  ],
  descendantsByStartAndType: createDescendantsByStartAndType(),
  subtopics: [
    { id: 'subtopic-b', name: 'Boden' },
    { id: 'subtopic-a', name: 'Artenschutz' },
    { id: 'subtopic-c', name: 'Denkmalschutz' },
  ] satisfies Pick<RpbSubtopicNode, 'id' | 'name'>[],
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
    useSearch: <TSelected,>(options?: {
      select?: (search: RouteSearch) => TSelected;
    }) =>
      options && 'select' in options && options.select
        ? options.select(routeState.search)
        : routeState.search,
    useNavigate: () => mocks.navigateMock,
  }),
  Link: (props: {
    children: ReactNode;
    resetScroll?: boolean;
    search?: (prev: Record<string, unknown>) => Record<string, unknown>;
  }) => (
    <a
      href="/verfahren/verfahren-1/rpb"
      onClick={(event) => {
        event.preventDefault();
        mocks.navigateMock({
          resetScroll: props.resetScroll,
          search: props.search,
        });
      }}
    >
      {props.children}
    </a>
  ),
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

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: () => mocks.argumentRefs,
}));

vi.mock('@/db/nodes/hooks/useDescendantNodes', () => ({
  useDescendantNodes: (nodeType: string) => ({
    data: nodeType === 'subtopic' ? mocks.subtopics : [],
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
  ) => mocks.descendantsByStartAndType[`${startId}:${nodeType}`] ?? [],
}));

vi.mock('@/features/ui/accordion/Accordion', () => ({
  AccordionContent: (props: ComponentProps<'div'>) => (
    <div>{props.children}</div>
  ),
  AccordionItem: (props: ComponentProps<'div'>) => <div>{props.children}</div>,
}));

vi.mock('@/features/ui/skeleton/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('../shared/AiSectionTrigger', () => ({
  AiSectionTrigger: (props: { count: number; titleKey: string }) => (
    <div>
      {props.titleKey} ({props.count})
    </div>
  ),
}));

describe('AiParticipationSection', () => {
  afterEach(cleanup);

  beforeEach(() => {
    routeState.search = { topicId: 'topic-1' };
    mocks.navigateMock.mockReset();
    mocks.argumentRefs = [
      createArgumentRef('argument-1'),
      createArgumentRef('argument-2'),
      createArgumentRef('argument-3'),
    ];
    mocks.descendantsByStartAndType = createDescendantsByStartAndType();
    mocks.subtopics = [
      { id: 'subtopic-b', name: 'Boden' },
      { id: 'subtopic-a', name: 'Artenschutz' },
      { id: 'subtopic-c', name: 'Denkmalschutz' },
    ] satisfies Pick<RpbSubtopicNode, 'id' | 'name'>[];
  });

  it('shows the selected-topic argument count in the trigger', () => {
    render(<AiParticipationSection />);

    expect(screen.getByText(/\(3\)/)).toBeInTheDocument();
  });

  it('renders real subtopics with zero-count subtopics at the bottom', () => {
    render(<AiParticipationSection />);

    const clickableRows = screen.getAllByRole('link');

    expect(clickableRows[0]).toHaveTextContent('Boden (1)');
    expect(clickableRows[1]).toHaveTextContent(
      'aiAssistance.participationSonstige (2)',
    );
    expect(screen.getByText('Artenschutz (0)')).toBeInTheDocument();
    expect(screen.getByText('Denkmalschutz (0)')).toBeInTheDocument();
  });

  it('counts Sonstige from topic arguments without a subtopic graph parent', () => {
    render(<AiParticipationSection />);

    expect(
      screen.getByText('aiAssistance.participationSonstige (2)'),
    ).toBeInTheDocument();
  });

  it('writes the selected subtopic to the URL when clicked', async () => {
    render(<AiParticipationSection />);

    await userEvent.click(screen.getByRole('link', { name: 'Boden (1)' }));

    expect(mocks.navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      resetScroll: false,
    });

    const navigateOptions = mocks.navigateMock.mock.calls[0]?.[0];
    expect(navigateOptions.search({ topicNormId: 'norm-1' })).toEqual({
      aiOverviewSection: 'beteiligungseingaenge',
      participationSubtopicId: 'subtopic-b',
      rechtsmethodikSatzId: undefined,
      satzId: undefined,
      showNormtext: undefined,
      topicNormId: undefined,
    });
  });

  it('does not make zero-count subtopics clickable', () => {
    render(<AiParticipationSection />);

    expect(
      screen.queryByRole('link', { name: 'Artenschutz (0)' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Artenschutz (0)')).toBeInTheDocument();
  });

  it('shows a topic hint when no topic is selected', () => {
    routeState.search = {};
    mocks.argumentRefs = [];

    render(<AiParticipationSection />);

    expect(
      screen.getByText('aiAssistance.participationSelectTopicHint'),
    ).toBeInTheDocument();
  });
});
