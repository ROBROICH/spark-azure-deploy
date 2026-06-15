import type { UserOidcRole } from '@/api-clients/identity-management-module/types.gen';
import {
  useLiveTopicNodes,
  useTopicNodes,
} from '@/db/nodes/hooks/useTopicNodes';
import type { NodePayloadByType } from '@/db/nodes/types';
import { useProject } from '@/features/project/data/collections/projects.collection';
import { useCurrentUser } from '@/features/access-control/current-user/CurrentUserProvider';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

const projectRoute = getRouteApi('/verfahren/$verfahrenId');

type TopicNode = Pick<NodePayloadByType<'topic'>, 'id' | 'mvp_assignees'>;

export type TopicWritePermissionReason =
  | 'admin'
  | 'assigned'
  | 'assignedToOtherUser'
  | 'noTopic'
  | 'notMember'
  | 'owner'
  | 'unassignedTopic';

export type TopicWritePermissionState = {
  canWrite: boolean;
  reason: TopicWritePermissionReason;
};

type TopicWritePermissionContext = {
  currentUserId: string;
  currentUserRole: UserOidcRole;
  projectMemberIds: string[];
  projectOwnerIds: string[];
};

export type DeriveTopicWritePermissionParams = TopicWritePermissionContext & {
  assigneeIds: string[] | null;
};

/**
 * Derives topic write access from an assignee list plus the current
 * user/project context. `null` represents an intentional no-topic chapter,
 * while an empty array represents a linked topic with no assignees.
 */
export function deriveTopicWritePermission(
  params: DeriveTopicWritePermissionParams,
): TopicWritePermissionState {
  const isAdmin = params.currentUserRole === 'admin';
  const isOwner = params.projectOwnerIds.includes(params.currentUserId);
  const isMember = params.projectMemberIds.includes(params.currentUserId);

  if (params.assigneeIds === null) {
    return isAdmin || isOwner || isMember
      ? { canWrite: true, reason: 'noTopic' }
      : { canWrite: false, reason: 'notMember' };
  }

  if (isAdmin) {
    return { canWrite: true, reason: 'admin' };
  }

  if (isOwner) {
    return { canWrite: true, reason: 'owner' };
  }

  if (!isMember) {
    return { canWrite: false, reason: 'notMember' };
  }

  if (params.assigneeIds.includes(params.currentUserId)) {
    return { canWrite: true, reason: 'assigned' };
  }

  if (params.assigneeIds.length === 0) {
    return { canWrite: true, reason: 'unassignedTopic' };
  }

  return { canWrite: false, reason: 'assignedToOtherUser' };
}

export function hasTopicMutationRights(
  topicNode: TopicNode,
  context: TopicWritePermissionContext,
) {
  return deriveTopicWritePermission({
    ...context,
    assigneeIds: topicNode.mvp_assignees,
  }).canWrite;
}

const useTopicWritePermissionContext = () => {
  const { role, userId } = useCurrentUser();
  const { verfahrenId } = projectRoute.useParams();
  const { data: project } = useProject(verfahrenId);

  // eslint-disable-next-line no-restricted-syntax -- memoized context keeps topic permission callbacks stable for card/editor consumers.
  return useMemo(
    () => ({
      currentUserId: userId,
      currentUserRole: role,
      projectMemberIds: project?.members ?? [],
      projectOwnerIds: project?.owners ?? [],
    }),
    [project?.members, project?.owners, role, userId],
  );
};

export function useTopicWritePermission() {
  const context = useTopicWritePermissionContext();

  // eslint-disable-next-line no-restricted-syntax -- badge and card consumers reuse this assignee-list predicate across memoized UI boundaries.
  return useCallback(
    (assigneeIds: string[] | null) =>
      deriveTopicWritePermission({
        ...context,
        assigneeIds,
      }),
    [context],
  );
}

const useHasTopicMutationRightsForTopics = (topics: TopicNode[]) => {
  const context = useTopicWritePermissionContext();

  // eslint-disable-next-line no-restricted-syntax -- precomputing rights once lets overview cards and editor sections do cheap id lookups.
  const mutableTopicIdSet = useMemo(() => {
    return new Set(
      topics
        .filter((topic) =>
          hasTopicMutationRights(topic, {
            currentUserId: context.currentUserId,
            currentUserRole: context.currentUserRole,
            projectMemberIds: context.projectMemberIds,
            projectOwnerIds: context.projectOwnerIds,
          }),
        )
        .map((topic) => topic.id),
    );
  }, [context, topics]);

  // eslint-disable-next-line no-restricted-syntax -- consumers pass this predicate through memoized editor and card boundaries, so stable identity prevents avoidable subtree churn.
  return useCallback(
    (topicId: string | null | undefined) => {
      if (!topicId) {
        return false;
      }

      return mutableTopicIdSet.has(topicId);
    },
    [mutableTopicIdSet],
  );
};

export function useHasTopicMutationRights() {
  const { data: topics } = useTopicNodes();

  return useHasTopicMutationRightsForTopics(topics);
}

export function useLiveHasTopicMutationRights() {
  const { data: topics } = useLiveTopicNodes();

  return useHasTopicMutationRightsForTopics(topics);
}
