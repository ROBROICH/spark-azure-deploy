import { useProject } from '@/features/project/data/collections/projects.collection';
import { useCurrentUser } from '@/features/access-control/current-user/CurrentUserProvider';
import { getRouteApi } from '@tanstack/react-router';
import { isProjectOwnerOrMember } from './isProjectOwnerOrMember';

const projectRoute = getRouteApi('/verfahren/$verfahrenId');

type ProjectMutationLevel = 'owner' | 'user';

type UseCanMutateProjectParams = {
  requiredLevel: ProjectMutationLevel;
};

export function useCanMutateProject(params: UseCanMutateProjectParams) {
  const { requiredLevel } = params;
  const { role, userId } = useCurrentUser();
  const { verfahrenId } = projectRoute.useParams();
  const { data: project } = useProject(verfahrenId);
  const isOwner = project?.owners.includes(userId) ?? false;
  const canMutateProject =
    requiredLevel === 'owner'
      ? role === 'admin' || isOwner
      : project
        ? isProjectOwnerOrMember({ project, role, userId })
        : false;

  return { canMutateProject };
}
