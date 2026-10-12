import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveTopicWritePermission,
  hasTopicMutationRights,
  useHasTopicMutationRights,
  useTopicWritePermission,
} from './hasTopicMutationRights';

const { useCurrentUserMock, useGraphMock, useProjectMock } = vi.hoisted(() => ({
  useCurrentUserMock: vi.fn(),
  useGraphMock: vi.fn(),
  useProjectMock: vi.fn(),
}));

vi.mock('@/features/access-control/current-user/CurrentUserProvider', () => ({
  useCurrentUser: useCurrentUserMock,
}));

vi.mock('@/features/project/data/collections/projects.collection', () => ({
  useProject: useProjectMock,
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
    useParams: () => ({
      verfahrenId: 'project-1',
    }),
  }),
}));

const topicNode = {
  id: 'topic-id',
  mvpAssignees: ['mvp-assignee-id'],
};

describe('deriveTopicWritePermission', () => {
  it('allows no-topic writes for project participants with the no-topic reason', () => {
    expect(
      deriveTopicWritePermission({
        assigneeIds: null,
        currentUserId: 'owner-id',
        currentUserRole: 'user',
        projectMemberIds: [],
        projectOwnerIds: ['owner-id'],
      }),
    ).toEqual({ canWrite: true, reason: 'noTopic' });
    expect(
      deriveTopicWritePermission({
        assigneeIds: null,
        currentUserId: 'member-id',
        currentUserRole: 'user',
        projectMemberIds: ['member-id'],
        projectOwnerIds: [],
      }),
    ).toEqual({ canWrite: true, reason: 'noTopic' });
  });

  it('distinguishes unassigned topics from topics assigned to someone else', () => {
    expect(
      deriveTopicWritePermission({
        assigneeIds: ['other-member-id'],
        currentUserId: 'member-id',
        currentUserRole: 'user',
        projectMemberIds: ['member-id'],
        projectOwnerIds: [],
      }),
    ).toEqual({ canWrite: false, reason: 'assignedToOtherUser' });
  });

  it('uses authority and assignment reasons for linked topics', () => {
    expect(
      deriveTopicWritePermission({
        assigneeIds: ['member-id'],
        currentUserId: 'admin-id',
        currentUserRole: 'admin',
        projectMemberIds: [],
        projectOwnerIds: [],
      }),
    ).toEqual({ canWrite: true, reason: 'admin' });
    expect(
      deriveTopicWritePermission({
        assigneeIds: ['member-id'],
        currentUserId: 'owner-id',
        currentUserRole: 'user',
        projectMemberIds: [],
        projectOwnerIds: ['owner-id'],
      }),
    ).toEqual({ canWrite: true, reason: 'owner' });
    expect(
      deriveTopicWritePermission({
        assigneeIds: ['member-id'],
        currentUserId: 'member-id',
        currentUserRole: 'user',
        projectMemberIds: ['member-id'],
        projectOwnerIds: [],
      }),
    ).toEqual({ canWrite: true, reason: 'assigned' });
  });

  it('denies non-members', () => {
    expect(
      deriveTopicWritePermission({
        assigneeIds: null,
        currentUserId: 'user-id',
        currentUserRole: 'user',
        projectMemberIds: [],
        projectOwnerIds: [],
      }),
    ).toEqual({ canWrite: false, reason: 'notMember' });
  });
});

describe('hasTopicMutationRights', () => {
  it('allows admins to mutate topics', () => {
    expect(
      hasTopicMutationRights(topicNode, {
        currentUserId: 'user-id',
        currentUserRole: 'admin',
        projectMemberIds: [],
        projectOwnerIds: [],
      }),
    ).toBe(true);
  });

  it('allows project owners to mutate topics', () => {
    expect(
      hasTopicMutationRights(topicNode, {
        currentUserId: 'owner-id',
        currentUserRole: 'user',
        projectMemberIds: [],
        projectOwnerIds: ['owner-id'],
      }),
    ).toBe(true);
  });

  it('allows project members assigned to the topic to mutate topics', () => {
    expect(
      hasTopicMutationRights(topicNode, {
        currentUserId: 'mvp-assignee-id',
        currentUserRole: 'user',
        projectMemberIds: ['mvp-assignee-id'],
        projectOwnerIds: [],
      }),
    ).toBe(true);
  });

  it('denies non-members on unassigned topics', () => {
    expect(
      hasTopicMutationRights(
        {
          id: 'unassigned-topic-id',
          mvpAssignees: [],
        },
        {
          currentUserId: 'user-id',
          currentUserRole: 'user',
          projectMemberIds: [],
          projectOwnerIds: [],
        },
      ),
    ).toBe(false);
  });

  it('denies stale topic assignees who are no longer project members', () => {
    expect(
      hasTopicMutationRights(topicNode, {
        currentUserId: 'mvp-assignee-id',
        currentUserRole: 'user',
        projectMemberIds: [],
        projectOwnerIds: [],
      }),
    ).toBe(false);
  });

  it('denies regular users who are neither project owners nor topic assignees', () => {
    expect(
      hasTopicMutationRights(topicNode, {
        currentUserId: 'user-id',
        currentUserRole: 'user',
        projectMemberIds: ['user-id'],
        projectOwnerIds: [],
      }),
    ).toBe(false);
  });
});

describe('useHasTopicMutationRights', () => {
  beforeEach(() => {
    useCurrentUserMock.mockReset();
    useGraphMock.mockReset();
    useProjectMock.mockReset();
    useGraphMock.mockReturnValue({
      topics: [topicNode],
    });
    useProjectMock.mockReturnValue({
      data: {
        members: [],
        owners: [],
      },
    });
  });

  it('fails closed when the caller has no topic id', () => {
    useCurrentUserMock.mockReturnValue({
      role: 'admin',
      userId: 'admin-id',
    });
    useProjectMock.mockReturnValue({
      data: {
        members: ['member-id'],
        owners: ['owner-id'],
      },
    });

    const { result } = renderHook(() => useHasTopicMutationRights());

    expect(result.current(null)).toBe(false);
    expect(result.current(undefined)).toBe(false);
  });

  it('does not grant project participants mutation rights from a missing topic id', () => {
    useCurrentUserMock.mockReturnValue({
      role: 'user',
      userId: 'member-id',
    });
    useProjectMock.mockReturnValue({
      data: {
        members: ['member-id'],
        owners: ['owner-id'],
      },
    });

    const { result } = renderHook(() => useHasTopicMutationRights());

    expect(result.current(null)).toBe(false);
    expect(result.current(undefined)).toBe(false);
  });

  it('exposes the full topic write state from assignees', () => {
    useCurrentUserMock.mockReturnValue({
      role: 'user',
      userId: 'member-id',
    });
    useProjectMock.mockReturnValue({
      data: {
        members: ['member-id'],
        owners: [],
      },
    });

    const { result } = renderHook(() => useTopicWritePermission());

    expect(result.current(['other-member-id'])).toEqual({
      canWrite: false,
      reason: 'assignedToOtherUser',
    });
  });

  it('keeps explicit no-topic write state available outside mutation guards', () => {
    useCurrentUserMock.mockReturnValue({
      role: 'user',
      userId: 'member-id',
    });
    useProjectMock.mockReturnValue({
      data: {
        members: ['member-id'],
        owners: [],
      },
    });

    const { result } = renderHook(() => useTopicWritePermission());

    expect(result.current(null)).toEqual({
      canWrite: true,
      reason: 'noTopic',
    });
  });

  it('fails closed for concrete topic ids absent from the graph payloads', () => {
    useCurrentUserMock.mockReturnValue({
      role: 'admin',
      userId: 'admin-id',
    });
    useGraphMock.mockReturnValue({
      topics: [topicNode],
    });

    const { result } = renderHook(() => useHasTopicMutationRights());

    expect(result.current('topic-id')).toBe(true);
    expect(result.current('missing-topic-id')).toBe(false);
  });
});
