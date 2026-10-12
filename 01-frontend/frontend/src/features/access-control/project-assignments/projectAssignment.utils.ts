import type {
  Relation,
  V1IdentityReplaceProjectAssignmentsData as ReplaceProjectAssignmentsData,
} from '@/api-clients/backend';

type ProjectAssignmentsRequest = ReplaceProjectAssignmentsData['body'];

export type ProjectAssignmentRelation = Extract<Relation, 'member' | 'owner'>;

export type ProjectAssignmentLists = {
  owners: string[];
  members: string[];
};

export const uniqueUserIds = (userIds: string[]) =>
  Array.from(
    new Set(
      userIds
        .map((userId) => userId.trim())
        .filter((userId) => userId.length > 0),
    ),
  );

export const replaceProjectAssignmentRelation = (params: {
  assignments: ProjectAssignmentLists;
  relation: ProjectAssignmentRelation;
  value: string[];
}): ProjectAssignmentLists => {
  const nextValue = uniqueUserIds(params.value);
  const nextValueIds = new Set(nextValue);

  if (params.relation === 'owner') {
    return {
      owners: nextValue,
      members: uniqueUserIds(params.assignments.members).filter(
        (userId) => !nextValueIds.has(userId),
      ),
    };
  }

  return {
    owners: uniqueUserIds(params.assignments.owners).filter(
      (userId) => !nextValueIds.has(userId),
    ),
    members: nextValue,
  };
};

export const toProjectAssignmentsRequest = (
  assignments: ProjectAssignmentLists,
): ProjectAssignmentsRequest => ({
  assignments: [
    ...uniqueUserIds(assignments.owners).map((userId) => ({
      role: 'owner' as const,
      userId: userId,
    })),
    ...uniqueUserIds(assignments.members).map((userId) => ({
      role: 'member' as const,
      userId: userId,
    })),
  ],
});
