import { useCurrentUser } from './CurrentUserProvider';

export function useIsAdmin(): boolean {
  const { role } = useCurrentUser();

  return role === 'admin';
}
