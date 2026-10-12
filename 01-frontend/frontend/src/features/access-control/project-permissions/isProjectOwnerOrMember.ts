import type { UserOidcRole } from '@/api-clients/backend/types.gen';
import type { ProjectResponse } from '@/api-clients/backend';

type ProjectTeam = Pick<ProjectResponse, 'members' | 'owners'>;

type IsProjectOwnerOrMemberParams = {
  project: ProjectTeam;
  role: UserOidcRole;
  userId: string;
};

export function isProjectOwnerOrMember(
  params: IsProjectOwnerOrMemberParams,
): boolean {
  const { project, role, userId } = params;

  if (role === 'admin') {
    return true;
  }

  return project.owners.includes(userId) || project.members.includes(userId);
}
