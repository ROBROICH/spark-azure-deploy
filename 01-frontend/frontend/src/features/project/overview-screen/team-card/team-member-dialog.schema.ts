import { z } from 'zod';

export const teamMemberRoleSchema = z.union([
  z.literal('owner'),
  z.literal('member'),
]);

export const createTeamMemberTopicIdsSchema = (
  getMessage: (key: string) => string,
  topicIds: string[],
) =>
  z
    .array(z.string())
    .refine(
      (selectedTopicIds) =>
        selectedTopicIds.every((topicId) => topicIds.includes(topicId)),
      getMessage('invalidTopic'),
    );
