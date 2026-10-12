import type { NodePayloadByType } from '@/db/nodes/types';

const MAX_TOPIC_ASSIGNEES = 7;

export type TeamTopicNode = NodePayloadByType<'topic'>;

const isUserAssignedToTopic = (topic: TeamTopicNode, userId: string) =>
  topic.mvpAssignees.includes(userId);

export const getAssignedTopicIds = (topics: TeamTopicNode[], userId: string) =>
  topics
    .filter((topic) => isUserAssignedToTopic(topic, userId))
    .map((topic) => topic.id);

const replaceAssignees = (params: {
  assignees: string[];
  shouldAssign: boolean;
  userIds: string[];
}) => {
  const userIdSet = new Set(params.userIds);
  const withoutUsers = params.assignees.filter(
    (userId) => !userIdSet.has(userId),
  );

  if (!params.shouldAssign) {
    return withoutUsers;
  }

  return [...withoutUsers, ...params.userIds].slice(0, MAX_TOPIC_ASSIGNEES);
};

const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

export const getTopicAssigneeUpdate = (params: {
  editedUserIds: Set<string>;
  selectedTopicIds: Set<string>;
  topic: TeamTopicNode;
  userIds: string[];
}) => {
  const hasEditedAssignee = params.topic.mvpAssignees.some((userId) =>
    params.editedUserIds.has(userId),
  );
  const shouldAssign = params.selectedTopicIds.has(params.topic.id);

  if (!shouldAssign && !hasEditedAssignee) {
    return null;
  }

  const mvpAssignees = replaceAssignees({
    assignees: params.topic.mvpAssignees,
    shouldAssign,
    userIds: params.userIds,
  });

  if (areStringArraysEqual(mvpAssignees, params.topic.mvpAssignees)) {
    return null;
  }

  return { mvpAssignees };
};
