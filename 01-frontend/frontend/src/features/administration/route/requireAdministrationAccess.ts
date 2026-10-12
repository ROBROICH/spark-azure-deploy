import { getCurrentUserQueryOptions } from '@/features/access-control/current-user/currentUser';
import type { QueryClient } from '@tanstack/react-query';
import { notFound } from '@tanstack/react-router';

/**
 * Blocks non-admin callers from administration routes with the same not-found
 * result used by the original overview gate.
 */
export const requireAdministrationAccess = async (queryClient: QueryClient) => {
  const currentUser = await queryClient.fetchQuery(
    getCurrentUserQueryOptions(),
  );

  if (currentUser.role !== 'admin') {
    throw notFound();
  }
};
