import { useCurrentUser } from '@/features/access-control/current-user/CurrentUserProvider';

export function useCanDeleteProject() {
  const { role } = useCurrentUser();

  return { canDeleteProject: role === 'admin' };
}
