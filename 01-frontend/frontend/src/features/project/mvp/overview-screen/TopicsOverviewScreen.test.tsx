import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopicsOverviewScreen } from './TopicsOverviewScreen';
import { TOPIC_UNASSIGNED_FILTER_ID } from './overview.logic';

const {
  routeSearchMock,
  updateMock,
  transactMock,
  toastMock,
  topicCardPropsMock,
  useGraphMock,
  useTopicWritePermissionMock,
  useOverviewTopicNormsByTopicIdMock,
  useProjectAssignedUsersMock,
} = vi.hoisted(() => ({
  routeSearchMock: {
    search: '',
    topicAssigneeIds: undefined as string[] | undefined,
    topicSort: 'titleAsc',
    topicStatus: undefined as string | undefined,
  },
  updateMock: vi.fn(),
  transactMock: vi.fn(),
  toastMock: {
    error: vi.fn(),
  },
  topicCardPropsMock: vi.fn(),
  useGraphMock: vi.fn(),
  useTopicWritePermissionMock: vi.fn(),
  useOverviewTopicNormsByTopicIdMock: vi.fn(),
  useProjectAssignedUsersMock: vi.fn(),
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: toastMock,
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    transact: transactMock,
    update: updateMock,
  }),
}));

vi.mock('@/db/nodes/ProjectGraphProvider', () => ({
  useGraph: useGraphMock,
}));

vi.mock('@/db/nodes/hooks/useTopicNodes', () => ({
  useTopicNodes: () => ({
    data: useGraphMock().topics ?? [],
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: () => routeSearchMock,
    useParams: () => ({
      verfahrenId: 'project-id',
    }),
  }),
}));

vi.mock(
  '@/features/project/law-changes/data/collections/lawChanges.collection',
  () => ({
    lawChangesCollection: {},
  }),
);

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({ data: [] }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./screen-data/useOverviewTopicNormsByTopicId', () => ({
  useOverviewTopicNormsByTopicId: useOverviewTopicNormsByTopicIdMock,
}));

vi.mock('./screen-data/useProjectAssignedUsers', () => ({
  useProjectAssignedUsers: useProjectAssignedUsersMock,
}));

vi.mock(
  '@/features/access-control/topic-permissions/hasTopicMutationRights',
  () => ({
    useTopicWritePermission: useTopicWritePermissionMock,
  }),
);

vi.mock('./screen-content/MvpOverviewHeader', () => ({
  MvpOverviewHeader: () => <div data-testid="overview-header" />,
}));

vi.mock('./screen-content/MvpTopicsFilterBar', () => ({
  MvpTopicsFilterBar: () => <div data-testid="topics-filter-bar" />,
}));

vi.mock('./screen-content/MvpTopicCard', () => ({
  MvpTopicCard: (
    props: Record<string, unknown> & {
      topic: { id: string; name: string };
      canChangeAssignedUsers: boolean;
      onChangeAssignedUsers: (topicId: string, userIds: string[]) => void;
    },
  ) => {
    topicCardPropsMock(props);

    return (
      <div>
        <span>{props.topic.name}</span>
        <button
          onClick={() =>
            props.onChangeAssignedUsers(props.topic.id, [
              'user-1',
              'user-2',
              'user-3',
              'user-4',
              'user-5',
              'user-6',
              'user-7',
              'user-8',
            ])
          }
        >
          change-{props.topic.id}
        </button>
      </div>
    );
  },
}));

describe('TopicsOverviewScreen', () => {
  beforeEach(() => {
    cleanup();
    updateMock.mockReset();
    transactMock.mockReset();
    toastMock.error.mockReset();
    topicCardPropsMock.mockReset();
    useOverviewTopicNormsByTopicIdMock.mockReset();
    useProjectAssignedUsersMock.mockReset();
    useGraphMock.mockReset();
    useTopicWritePermissionMock.mockReset();
    routeSearchMock.search = '';
    routeSearchMock.topicAssigneeIds = undefined;
    routeSearchMock.topicSort = 'titleAsc';
    routeSearchMock.topicStatus = undefined;

    transactMock.mockImplementation((callback: () => void) => {
      callback();

      return {
        isPersisted: {
          promise: Promise.resolve(),
        },
      };
    });

    updateMock.mockImplementation(
      (
        topic: { mvpAssignees: string[]; updatedAt: string },
        updater: (draft: { mvpAssignees: string[]; updatedAt: string }) => void,
      ) => {
        const draft = { ...topic };
        updater(draft);

        return draft;
      },
    );

    useOverviewTopicNormsByTopicIdMock.mockReturnValue(new Map());
    useProjectAssignedUsersMock.mockReturnValue({
      isOrganizationUsersError: false,
      projectUsers: [
        { userId: 'user-1' },
        { userId: 'user-2' },
        { userId: 'user-3' },
      ],
    });
    useTopicWritePermissionMock.mockReturnValue(() => ({
      canWrite: true,
      reason: 'assigned',
    }));
  });

  it('hides topics excluded from MVP and writes changed assignments', async () => {
    const visibleTopic = {
      id: 'topic-visible',
      name: 'Visible topic',
      mvpAssignees: ['current-user-id'],
      showInMvp: true,
      updatedAt: '2026-04-21T09:00:00.000Z',
    };
    const hiddenTopic = {
      id: 'topic-hidden',
      name: 'Hidden topic',
      mvpAssignees: ['someone-else'],
      showInMvp: false,
      updatedAt: '2026-04-21T09:00:00.000Z',
    };

    useGraphMock.mockReturnValue({
      index: {
        childrenByNodeId: new Map(),
        countByStartIdAndType: new Map(),
        edgeCount: 0,
        firstRefByStartIdAndType: new Map(),
        hasByStartIdAndType: new Map(),
        idsByStartId: new Map(),
        nodeById: new Map(),
        nodeCountsByType: new Map(),
        nodesByType: new Map(),
        parentIdsByNodeId: new Map(),
        refsByStartId: new Map(),
        refsByStartIdAndType: new Map(),
        rootNodeIds: [],
      },
      topics: [visibleTopic, hiddenTopic],
    });

    render(<TopicsOverviewScreen />);

    expect(screen.getByText('Visible topic')).not.toBeNull();
    expect(screen.queryByText('Hidden topic')).toBeNull();
    expect(topicCardPropsMock).toHaveBeenCalledTimes(1);
    expect(topicCardPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({ canChangeAssignedUsers: true }),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'change-topic-visible' }),
    );

    expect(updateMock).toHaveBeenCalledWith(visibleTopic, expect.any(Function));

    const updateDraft = {
      mvpAssignees: visibleTopic.mvpAssignees,
      updatedAt: visibleTopic.updatedAt,
    };
    updateMock.mock.calls[0]?.[1](updateDraft);

    expect(updateDraft.mvpAssignees).toEqual([
      'user-1',
      'user-2',
      'user-3',
      'user-4',
      'user-5',
      'user-6',
      'user-7',
    ]);
    expect(typeof updateDraft.updatedAt).toBe('string');
  });

  it('shows only topics assigned to selected people from route search', () => {
    routeSearchMock.topicAssigneeIds = ['user-1', 'user-3'];
    const firstMatchingTopic = {
      id: 'topic-first-match',
      name: 'First match',
      mvpAssignees: ['user-1'],
      showInMvp: true,
      updatedAt: '2026-04-21T09:00:00.000Z',
    };
    const secondMatchingTopic = {
      id: 'topic-second-match',
      name: 'Second match',
      mvpAssignees: ['user-2', 'user-3'],
      showInMvp: true,
      updatedAt: '2026-04-21T09:00:00.000Z',
    };
    const nonMatchingTopic = {
      id: 'topic-no-match',
      name: 'No match',
      mvpAssignees: ['user-2'],
      showInMvp: true,
      updatedAt: '2026-04-21T09:00:00.000Z',
    };
    const unassignedTopic = {
      id: 'topic-unassigned',
      name: 'Unassigned',
      mvpAssignees: [],
      showInMvp: true,
      updatedAt: '2026-04-21T09:00:00.000Z',
    };

    useGraphMock.mockReturnValue({
      index: {
        childrenByNodeId: new Map(),
        countByStartIdAndType: new Map(),
        edgeCount: 0,
        firstRefByStartIdAndType: new Map(),
        hasByStartIdAndType: new Map(),
        idsByStartId: new Map(),
        nodeById: new Map(),
        nodeCountsByType: new Map(),
        nodesByType: new Map(),
        parentIdsByNodeId: new Map(),
        refsByStartId: new Map(),
        refsByStartIdAndType: new Map(),
        rootNodeIds: [],
      },
      topics: [
        firstMatchingTopic,
        secondMatchingTopic,
        nonMatchingTopic,
        unassignedTopic,
      ],
    });

    render(<TopicsOverviewScreen />);

    expect(screen.getByText('First match')).not.toBeNull();
    expect(screen.getByText('Second match')).not.toBeNull();
    expect(screen.queryByText('No match')).toBeNull();
    expect(screen.queryByText('Unassigned')).toBeNull();
  });

  it('shows only topics without assignees when the unassigned filter is selected', () => {
    routeSearchMock.topicAssigneeIds = [TOPIC_UNASSIGNED_FILTER_ID];
    const assignedTopic = {
      id: 'topic-assigned',
      name: 'Assigned',
      mvpAssignees: ['user-1'],
      showInMvp: true,
      updatedAt: '2026-04-21T09:00:00.000Z',
    };
    const unassignedTopic = {
      id: 'topic-unassigned',
      name: 'Unassigned',
      mvpAssignees: [],
      showInMvp: true,
      updatedAt: '2026-04-21T09:00:00.000Z',
    };

    useGraphMock.mockReturnValue({
      index: {
        childrenByNodeId: new Map(),
        countByStartIdAndType: new Map(),
        edgeCount: 0,
        firstRefByStartIdAndType: new Map(),
        hasByStartIdAndType: new Map(),
        idsByStartId: new Map(),
        nodeById: new Map(),
        nodeCountsByType: new Map(),
        nodesByType: new Map(),
        parentIdsByNodeId: new Map(),
        refsByStartId: new Map(),
        refsByStartIdAndType: new Map(),
        rootNodeIds: [],
      },
      topics: [assignedTopic, unassignedTopic],
    });

    render(<TopicsOverviewScreen />);

    expect(screen.queryByText('Assigned')).toBeNull();
    expect(screen.getByText('Unassigned')).not.toBeNull();
  });

  it('ignores stale selected assignee ids when filtering topics', () => {
    routeSearchMock.topicAssigneeIds = ['stale-user'];
    const staleOnlyTopic = {
      id: 'topic-stale-only',
      name: 'Stale only',
      mvpAssignees: ['stale-user'],
      showInMvp: true,
      updatedAt: '2026-04-21T09:00:00.000Z',
    };
    const activeUserTopic = {
      id: 'topic-active-user',
      name: 'Active user',
      mvpAssignees: ['user-1'],
      showInMvp: true,
      updatedAt: '2026-04-21T09:00:00.000Z',
    };

    useGraphMock.mockReturnValue({
      index: {
        childrenByNodeId: new Map(),
        countByStartIdAndType: new Map(),
        edgeCount: 0,
        firstRefByStartIdAndType: new Map(),
        hasByStartIdAndType: new Map(),
        idsByStartId: new Map(),
        nodeById: new Map(),
        nodeCountsByType: new Map(),
        nodesByType: new Map(),
        parentIdsByNodeId: new Map(),
        refsByStartId: new Map(),
        refsByStartIdAndType: new Map(),
        rootNodeIds: [],
      },
      topics: [staleOnlyTopic, activeUserTopic],
    });

    render(<TopicsOverviewScreen />);

    expect(screen.getByText('Stale only')).not.toBeNull();
    expect(screen.getByText('Active user')).not.toBeNull();
  });

  it('filters topics with normalized assignee ids when route search mixes stale and active ids', () => {
    routeSearchMock.topicAssigneeIds = ['stale-user', 'user-1'];
    const staleOnlyTopic = {
      id: 'topic-stale-only',
      name: 'Stale only',
      mvpAssignees: ['stale-user'],
      showInMvp: true,
      updatedAt: '2026-04-21T09:00:00.000Z',
    };
    const activeUserTopic = {
      id: 'topic-active-user',
      name: 'Active user',
      mvpAssignees: ['user-1'],
      showInMvp: true,
      updatedAt: '2026-04-21T09:00:00.000Z',
    };
    const otherActiveUserTopic = {
      id: 'topic-other-active-user',
      name: 'Other active user',
      mvpAssignees: ['user-2'],
      showInMvp: true,
      updatedAt: '2026-04-21T09:00:00.000Z',
    };

    useGraphMock.mockReturnValue({
      index: {
        childrenByNodeId: new Map(),
        countByStartIdAndType: new Map(),
        edgeCount: 0,
        firstRefByStartIdAndType: new Map(),
        hasByStartIdAndType: new Map(),
        idsByStartId: new Map(),
        nodeById: new Map(),
        nodeCountsByType: new Map(),
        nodesByType: new Map(),
        parentIdsByNodeId: new Map(),
        refsByStartId: new Map(),
        refsByStartIdAndType: new Map(),
        rootNodeIds: [],
      },
      topics: [staleOnlyTopic, activeUserTopic, otherActiveUserTopic],
    });

    render(<TopicsOverviewScreen />);

    expect(screen.queryByText('Stale only')).toBeNull();
    expect(screen.getByText('Active user')).not.toBeNull();
    expect(screen.queryByText('Other active user')).toBeNull();
  });
});
