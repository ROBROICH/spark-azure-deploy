import { organizationUsersCollection } from '@/features/access-control/organization-users/organizationUsers.collection';

const preloadOrganizationUsersForFailSoftCells = async () => {
  try {
    await organizationUsersCollection.preload();
  } catch {
    // Keep overview routes available; useOrganizationUsers exposes the cell-level error state.
  }
};

export const loadProjectsOverviewRoute = async () => {
  await preloadOrganizationUsersForFailSoftCells();
};
