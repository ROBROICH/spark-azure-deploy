import { useProject } from '@/features/project/data/collections/projects.collection';
import { useOrganizationUsers } from '@/features/access-control/organization-users/organizationUsers.collection';
import { sortOrganizationUsersByName } from '@/features/access-control/organization-users/organizationUser.utils';
import { getRouteApi } from '@tanstack/react-router';

const projectRoute = getRouteApi('/verfahren/$verfahrenId');

export function useProjectAssignedUsers() {
  const { verfahrenId } = projectRoute.useParams();
  const { data: organizationUsers, isError: isOrganizationUsersError } =
    useOrganizationUsers();
  const { data: project } = useProject(verfahrenId);
  const projectUserIds = new Set([
    ...(project?.owners ?? []),
    ...(project?.members ?? []),
  ]);
  const projectUsers = sortOrganizationUsersByName(
    organizationUsers.filter((user) => projectUserIds.has(user.userId)),
  );
  const projectUserIdsById = new Set(projectUsers.map((user) => user.userId));

  return {
    hasProjectUser: (userId: string) => projectUserIdsById.has(userId),
    isOrganizationUsersError,
    projectUsers,
  };
}
