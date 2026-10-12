import { useCurrentUser } from '@/features/access-control/current-user/CurrentUserProvider';
import { useMemo } from 'react';
import { useFavorites } from '@/features/project/data/project-favorites/useFavorites';
import { ProjectsTable } from './ProjectsTable';
import { ProjectsTableFeatureContext } from './ProjectsTableFeatureContext';
import { ProjectsTableToolbar } from './ProjectsTableToolbar';
import type { ProjectsTableSearchParams } from './projectsTable.search';
import { useProjectsTableData } from './useProjectsTableData';
import {
  type ProjectsTableNavigateFn,
  useProjectsTableRouteState,
} from './useProjectsTableRouteState';

type ProjectsTableFeatureProps = {
  searchState: ProjectsTableSearchParams;
  navigate: ProjectsTableNavigateFn;
};

/**
 * Centralizes the shared projects-table feature state before it is exposed
 * through the feature context provider.
 */
const useProjectsTableFeatureLogic = (props: ProjectsTableFeatureProps) => {
  const { searchState, navigate } = props;
  const routeState = useProjectsTableRouteState({ searchState, navigate });
  const { favoriteIds, toggle: toggleFavorite, canFavorite } = useFavorites();
  const { userId: currentUserId } = useCurrentUser();
  const {
    artOptions,
    statusOptions,
    favoriteOptions,
    zuordnungOptions,
    anlageOptions,
    isLoading,
    isError,
    retry,
    projects,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useProjectsTableData({
    search: routeState.committedSearch,
    sortColumn: routeState.sortColumn,
    sortDirection: routeState.sortDirection,
    filters: {
      anlageFilter: routeState.filters.anlageFilter,
      typeFilter: routeState.filters.typeFilter,
      statusFilter: routeState.filters.statusFilter,
      favoriteFilter: routeState.filters.favoriteFilter,
      zuordnungFilter: routeState.filters.zuordnungFilter,
    },
    favoriteIds,
    currentUserId,
  });

  // eslint-disable-next-line no-restricted-syntax -- Context provider value must stay referentially stable so the table only re-renders when committed route state or data actually change.
  return useMemo(
    () => ({
      routeState,
      favoriteIds,
      canFavorite,
      onToggleFavorite: toggleFavorite,
      projects,
      isLoading,
      isError,
      hasNextPage,
      isFetchingNextPage,
      fetchNextPage,
      retry,
      artOptions,
      anlageOptions,
      statusOptions,
      favoriteOptions,
      zuordnungOptions,
    }),
    [
      artOptions,
      anlageOptions,
      canFavorite,
      favoriteIds,
      favoriteOptions,
      zuordnungOptions,
      isLoading,
      isError,
      hasNextPage,
      isFetchingNextPage,
      fetchNextPage,
      retry,
      projects,
      routeState,
      statusOptions,
      toggleFavorite,
    ],
  );
};

/**
 * Compound feature that binds the URL-backed table route state, shared projects
 * table data hook, favorites integration, and project navigation into one
 * cohesive subtree. The debounced search wrapper owns its draft input locally,
 * while the shared feature context carries only committed route state and table data.
 */
export const ProjectsTableFeature = (props: ProjectsTableFeatureProps) => {
  const contextValue = useProjectsTableFeatureLogic(props);

  return (
    <ProjectsTableFeatureContext.Provider value={contextValue}>
      <div className="flex flex-col gap-6 rounded-md">
        <ProjectsTableToolbar />
        <ProjectsTable />
      </div>
    </ProjectsTableFeatureContext.Provider>
  );
};
