import type { IdentityResponse } from '@/api-clients/backend';
import { getOrganizationUserDisplayName } from '@/features/access-control/organization-users/organizationUser.utils';
import type { TeamMember, TeamMemberRole } from './team-member.types';

export const createTeamMembers = (params: {
  owners: string[];
  members: string[];
  users: IdentityResponse[];
}) => {
  const usersById = new Map(params.users.map((user) => [user.userId, user]));
  const toTeamMember = (id: string, role: TeamMemberRole): TeamMember => ({
    id,
    name: getOrganizationUserDisplayName(usersById.get(id)) ?? id,
    role,
  });

  return [
    ...params.owners.map((id) => toTeamMember(id, 'owner')),
    ...params.members.map((id) => toTeamMember(id, 'member')),
  ].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
  );
};

export const getTeamMemberIdsForRole = (params: {
  members: string[];
  owners: string[];
  role: TeamMemberRole;
  userIds: string[];
}) =>
  params.role === 'owner'
    ? [...params.owners, ...params.userIds]
    : [...params.members, ...params.userIds];
