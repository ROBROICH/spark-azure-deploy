import '@testing-library/jest-dom/vitest';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MvpTopicCard } from './MvpTopicCard';

const { lawChangeIndicatorPropsMock, topicWritePermissionBadgePropsMock } =
  vi.hoisted(() => ({
    lawChangeIndicatorPropsMock: vi.fn(),
    topicWritePermissionBadgePropsMock: vi.fn(),
  }));
const { linkPropsMock } = vi.hoisted(() => ({
  linkPropsMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    'aria-label'?: string;
    'aria-describedby'?: string;
    'aria-labelledby'?: string;
    children?: ReactNode;
    className?: string;
    params?: unknown;
    resetScroll?: boolean;
    search?: (prev: Record<string, unknown>) => Record<string, unknown>;
    to: string;
  }) => {
    linkPropsMock(props);

    return (
      <a
        aria-label={props['aria-label']}
        aria-describedby={props['aria-describedby']}
        aria-labelledby={props['aria-labelledby']}
        className={props.className}
        href={props.to}
      >
        {props.children}
      </a>
    );
  },
  getRouteApi: () => ({
    useParams: () => ({
      verfahrenId: 'verfahren-id',
    }),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, number>) => {
      if (key.endsWith('.documents')) {
        return `${String(params?.count)} von ${String(params?.total)} Unterlagen`;
      }

      if (key.endsWith('.norms')) {
        return `${String(params?.checked)} von ${String(params?.total)} Rechtsgrundlagen`;
      }

      if (key.endsWith('.mehrere_aenderungen')) {
        return 'Mehrere Änderungen';
      }

      return key;
    },
  }),
}));

vi.mock('@/features/ui/ai/AiStatusChip', () => ({
  AiStatusChip: () => <span data-testid="ai-icon" />,
}));

vi.mock(
  '@/features/project/law-changes/ui/AggregatedLawChangeIndicator',
  () => ({
    AggregatedLawChangeIndicatorView: (props: Record<string, unknown>) => {
      lawChangeIndicatorPropsMock(props);

      return <span data-testid="aggregated-law-change-indicator" />;
    },
  }),
);

vi.mock(
  '@/features/access-control/topic-permissions/TopicWritePermissionBadge',
  () => ({
    TopicWritePermissionBadge: (props: Record<string, unknown>) => {
      topicWritePermissionBadgePropsMock(props);

      return <span data-testid="topic-write-permission-badge" />;
    },
  }),
);

vi.mock('./AvatarHeader', () => ({
  AvatarHeader: () => <span data-testid="avatar-header" />,
}));

afterEach(() => {
  cleanup();
});

const topic = {
  compositeKey: toCompositeKey({ id: 'topic-1', node_type: 'topic' }),
  created_at: '2026-05-14T10:00:00.000Z',
  description: null,
  frontend_parent_ids: [],
  id: 'topic-1',
  is_deleted: false,
  is_outdated: false,
  mvp_assignee: null,
  mvp_assignees: [],
  name: 'Topic one',
  node_type: 'topic',
  parent_topic_id: null,
  project_id: 'project-id',
  project_version: 1,
  rpb_assignee: null,
  rpb_assignees: [],
  show_in_beschluss: true,
  show_in_ewm: true,
  show_in_mvp: true,
  sys_period: null,
  update_type: null,
  updated_at: '2026-05-14T10:00:00.000Z',
} satisfies NodePayloadByType<'topic'>;

const topicNorms = [
  {
    absatz: null,
    compositeKey: toCompositeKey({
      id: 'topic-norm-1',
      node_type: 'topic_norm',
    }),
    created_at: '2026-05-14T10:00:00.000Z',
    frontend_parent_ids: ['topic:topic-1'],
    id: 'topic-norm-1',
    is_deleted: false,
    is_outdated: false,
    jurabk: 'BImSchG',
    mvp_status: 'unchecked',
    node_type: 'topic_norm',
    nummer: null,
    paragraph_nr: '4',
    project_id: 'project-id',
    project_version: 1,
    satz: null,
    satz_statuses: {},
    sys_period: null,
    topic_id: 'topic-1',
    type: 'pruefung',
    update_type: null,
    updated_at: '2026-05-14T10:00:00.000Z',
  },
] satisfies NodePayloadByType<'topic_norm'>[];

const renderCard = (props?: {
  hasNeedsRevisionNorms?: boolean;
  topicNorms?: NodePayloadByType<'topic_norm'>[];
}) =>
  render(
    <MvpTopicCard
      topic={topic}
      topicNorms={props?.topicNorms ?? []}
      documentCount={2}
      lawChanges={[]}
      canChangeAssignedUsers
      hasInternalFundstelle={false}
      topicWritePermission={{ canWrite: true, reason: 'assigned' }}
      hasNeedsRevisionNorms={props?.hasNeedsRevisionNorms}
      onChangeAssignedUsers={() => undefined}
    />,
  );

describe('MvpTopicCard', () => {
  beforeEach(() => {
    lawChangeIndicatorPropsMock.mockReset();
    topicWritePermissionBadgePropsMock.mockReset();
    linkPropsMock.mockReset();
  });

  it('shows the changed-documents badge when a topic norm needs revision', () => {
    renderCard({ hasNeedsRevisionNorms: true });

    expect(screen.getByText('Mehrere Änderungen')).toBeInTheDocument();
  });

  it('hides the changed-documents badge when no topic norm needs revision', () => {
    renderCard();

    expect(screen.queryByText('Mehrere Änderungen')).toBeNull();
  });

  it('keeps the paragraph placeholder and renders the topic write badge', () => {
    renderCard();

    expect(screen.getByText('§')).toBeVisible();
    expect(screen.getByTestId('topic-write-permission-badge')).toBeVisible();
    expect(topicWritePermissionBadgePropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: { canWrite: true, reason: 'assigned' },
      }),
    );
  });

  it('renders the law change indicator after the topic write badge with topic norm refs', () => {
    renderCard({ topicNorms });

    const topicWriteBadge = screen.getByTestId('topic-write-permission-badge');
    const lawChangeIndicator = screen.getByTestId(
      'aggregated-law-change-indicator',
    );

    expect(
      topicWriteBadge.compareDocumentPosition(lawChangeIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(lawChangeIndicatorPropsMock).toHaveBeenCalledWith({
      lawChanges: [],
      norms: [{ jurabk: 'BImSchG', paragraphNr: '4' }],
    });
  });

  it('shows the AI icon when the overview resolved an internal fundstelle', () => {
    render(
      <MvpTopicCard
        topic={topic}
        topicNorms={[]}
        documentCount={2}
        lawChanges={[]}
        canChangeAssignedUsers
        hasInternalFundstelle
        topicWritePermission={{ canWrite: true, reason: 'assigned' }}
        onChangeAssignedUsers={() => undefined}
      />,
    );

    expect(screen.getByTestId('ai-icon')).toBeVisible();
    expect(screen.queryByText('§')).toBeNull();
  });

  it('preserves overview route state when opening topic detail', () => {
    renderCard();

    const linkProps = linkPropsMock.mock.calls[0]?.[0];
    expect(linkProps).toEqual(
      expect.objectContaining({
        params: { verfahrenId: 'verfahren-id', topicName: 'topic-1' },
        resetScroll: false,
        to: '/verfahren/$verfahrenId/mvp/$topicName',
      }),
    );
    expect(
      linkProps.search({
        detailDocumentId: 'topic-norm-1',
        lawChangeId: 'law-change-1',
        search: 'wasser',
        selectedDocumentId: 'doc-1',
        selectedNormId: 'norm-1',
        topicAssigneeIds: ['user-1'],
        topicSort: 'titleDesc',
        topicStatus: 'inProgress',
      }),
    ).toEqual({
      search: 'wasser',
      topicAssigneeIds: ['user-1'],
      topicSort: 'titleDesc',
      topicStatus: 'inProgress',
    });
  });
});
