import { toCompositeKey } from '@/db/nodes/compositeKey';
import {
  getDescendantNodeRefs,
  hasNode,
  type ProjectNodeIndex,
} from '@/db/nodes/examinationGraphModel';
import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import {
  isNeedsRevision,
  isReviewCompleted,
} from '@/features/project/versioning/revisionStatus';
import type { MvpCardStatus } from '../mvpTypes';
import { isTopicNormLinkedToTopicId } from '../topicNormLinks';

export { mapInternalFundstellePresenceByTopicId } from './internalFundstellePresence.logic';

export type TopicOverviewSortMode = 'titleAsc' | 'titleDesc';
export type TopicOverviewStatusFilter = MvpCardStatus;

export type TopicProgress = {
  checkedNormCount: number;
  totalNormCount: number;
  status: MvpCardStatus;
};

export const TOPIC_UNASSIGNED_FILTER_ID = '__topic_unassigned__';

type TopicAssigneeUser = {
  userId: string;
};

export const normalizeTopicAssigneeIds = (
  topicAssigneeIds: string[] | undefined,
  projectUsers: TopicAssigneeUser[],
): string[] => {
  if (!topicAssigneeIds || topicAssigneeIds.length === 0) {
    return [];
  }

  const includesUnassignedFilter = topicAssigneeIds.includes(
    TOPIC_UNASSIGNED_FILTER_ID,
  );
  const userOrderById = new Map(
    projectUsers.map((user, index) => [user.userId, index]),
  );
  const normalizedAssigneeIds = topicAssigneeIds
    .filter((userId) => userId !== TOPIC_UNASSIGNED_FILTER_ID)
    .filter((userId) => userOrderById.has(userId))
    .sort(
      (left, right) =>
        (userOrderById.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (userOrderById.get(right) ?? Number.MAX_SAFE_INTEGER),
    );

  return includesUnassignedFilter
    ? [TOPIC_UNASSIGNED_FILTER_ID, ...normalizedAssigneeIds]
    : normalizedAssigneeIds;
};

export const deriveTopicProgress = (
  topicNorms: NodePayloadByType<'topic_norm'>[],
): TopicProgress => {
  const totalNormCount = topicNorms.length;
  const checkedNormCount = topicNorms.filter((topicNorm) =>
    isReviewCompleted(topicNorm.mvp_status),
  ).length;
  const status =
    totalNormCount > 0 && checkedNormCount === totalNormCount
      ? 'complete'
      : checkedNormCount > 0
        ? 'inProgress'
        : 'open';

  return {
    checkedNormCount,
    totalNormCount,
    status,
  };
};

export const groupTopicNormRefsByTopicId = (
  topics: NodePayloadByType<'topic'>[],
  index: ProjectNodeIndex,
) => {
  const topicNormRefsByTopicId = new Map<
    string,
    NodeRefByType<'topic_norm'>[]
  >();

  for (const topic of topics) {
    if (!hasNode(index, topic.id)) {
      topicNormRefsByTopicId.set(topic.id, []);
      continue;
    }

    const topicNormRefs = getDescendantNodeRefs(index, topic.id).filter(
      (descendantRef): descendantRef is NodeRefByType<'topic_norm'> =>
        descendantRef.node_type === 'topic_norm',
    );
    topicNormRefsByTopicId.set(topic.id, topicNormRefs);
  }

  return topicNormRefsByTopicId;
};

export const collectUniqueTopicNormRefs = (
  topicNormRefsByTopicId: Map<string, NodeRefByType<'topic_norm'>[]>,
) => {
  const uniqueTopicNormRefsByKey = new Map<
    string,
    NodeRefByType<'topic_norm'>
  >();

  for (const topicNormRefs of topicNormRefsByTopicId.values()) {
    for (const topicNormRef of topicNormRefs) {
      uniqueTopicNormRefsByKey.set(toCompositeKey(topicNormRef), topicNormRef);
    }
  }

  return Array.from(uniqueTopicNormRefsByKey.values());
};

export const resolveTopicNormsByTopicId = (
  topics: NodePayloadByType<'topic'>[],
  topicNormRefsByTopicId: Map<string, NodeRefByType<'topic_norm'>[]>,
  topicNorms: NodePayloadByType<'topic_norm'>[],
) => {
  const topicNormById = new Map(
    topicNorms.map((topicNorm) => [topicNorm.id, topicNorm]),
  );
  const topicNormsByTopicId = new Map<
    string,
    NodePayloadByType<'topic_norm'>[]
  >();

  for (const topic of topics) {
    const topicNormsForTopic = (
      topicNormRefsByTopicId.get(topic.id) ?? []
    ).flatMap((topicNormRef) => {
      const topicNorm = topicNormById.get(topicNormRef.id);

      if (!topicNorm) {
        return [];
      }

      return isTopicNormLinkedToTopicId(topicNorm, topic.id) ? [topicNorm] : [];
    });

    topicNormsByTopicId.set(topic.id, topicNormsForTopic);
  }

  return topicNormsByTopicId;
};

export const countTopicDocuments = (
  topics: NodePayloadByType<'topic'>[],
  index: ProjectNodeIndex,
) => {
  return new Map(
    topics.map((topic) => {
      if (!hasNode(index, topic.id)) {
        return [topic.id, 0];
      }

      return [
        topic.id,
        getDescendantNodeRefs(index, topic.id).filter(
          (descendantRef) => descendantRef.node_type === 'dokument',
        ).length,
      ];
    }),
  );
};

export const countCompletedTopics = (
  topics: NodePayloadByType<'topic'>[],
  topicNormsByTopicId: Map<string, NodePayloadByType<'topic_norm'>[]>,
) => {
  return topics.filter((topic) => {
    return (
      deriveTopicProgress(topicNormsByTopicId.get(topic.id) ?? []).status ===
      'complete'
    );
  }).length;
};

export const hasNeedsRevisionTopicNorm = (
  topicNorms: NodePayloadByType<'topic_norm'>[],
) => {
  return topicNorms.some((topicNorm) => isNeedsRevision(topicNorm.mvp_status));
};

export const filterTopicsByStatus = (
  topics: NodePayloadByType<'topic'>[],
  topicNormsByTopicId: Map<string, NodePayloadByType<'topic_norm'>[]>,
  topicStatus: TopicOverviewStatusFilter | undefined,
) => {
  if (!topicStatus) {
    return topics;
  }

  return topics.filter((topic) => {
    return (
      deriveTopicProgress(topicNormsByTopicId.get(topic.id) ?? []).status ===
      topicStatus
    );
  });
};

export const filterTopicsByAssignees = (
  topics: NodePayloadByType<'topic'>[],
  topicAssigneeIds: string[] | undefined,
) => {
  if (!topicAssigneeIds || topicAssigneeIds.length === 0) {
    return topics;
  }

  const includeUnassignedTopics = topicAssigneeIds.includes(
    TOPIC_UNASSIGNED_FILTER_ID,
  );
  const selectedAssigneeIds = new Set(
    topicAssigneeIds.filter(
      (assigneeId) => assigneeId !== TOPIC_UNASSIGNED_FILTER_ID,
    ),
  );

  return topics.filter((topic) => {
    if (includeUnassignedTopics && topic.mvp_assignees.length === 0) {
      return true;
    }

    return topic.mvp_assignees.some((assigneeId) =>
      selectedAssigneeIds.has(assigneeId),
    );
  });
};

export const sortTopics = (
  topics: NodePayloadByType<'topic'>[],
  topicSort: TopicOverviewSortMode,
) => {
  return [...topics].sort((topicA, topicB) => {
    if (topicSort === 'titleAsc') {
      return topicA.name.localeCompare(topicB.name, 'de');
    }

    return topicB.name.localeCompare(topicA.name, 'de');
  });
};
