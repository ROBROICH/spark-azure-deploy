import { v1ProjectLogicListProjects } from '@/api-clients/backend';
import { v1ProjectLogicListProjectStatusesOptions } from '@/api-clients/backend/@tanstack/react-query.gen';
import {
  useProjectList,
  type ProjectListFilters,
} from '@/features/project/data/collections/projects.collection';
import { projectTypesCollection } from '@/features/project/data/project-types/projectTypes.collection';
import { useLiveQuery } from '@tanstack/react-db';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useDeferredValue } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnlageFilterValue } from './ProjectsTable.constants';
import {
  deriveOptions,
  type FavoriteFilterValue,
  type ZuordnungFilterValue,
} from './ProjectsTable.utils';

type ProjectsTableFilterValues = {
  anlageFilter: AnlageFilterValue[];
  typeFilter: string[];
  statusFilter: string[];
  favoriteFilter: FavoriteFilterValue[];
  zuordnungFilter: ZuordnungFilterValue;
};

type UseProjectsTableDataParams = {
  search: string;
  filters: ProjectsTableFilterValues;
  favoriteIds: string[];
  currentUserId: string | undefined;
  sortColumn: ProjectListFilters['sort'];
  sortDirection: ProjectListFilters['direction'];
};

/**
 * Converts table selections into filters applied before server pagination.
 * @param params - Current table selections and favorite project IDs.
 * @param deferredSearch - Search value deferred while the user types.
 * @returns Filters for the authorized project list.
 */
const getProjectListFilters = (
  params: UseProjectsTableDataParams,
  deferredSearch: string,
): ProjectListFilters => {
  const { filters, favoriteIds, sortColumn, sortDirection } = params;
  const {
    anlageFilter,
    typeFilter,
    statusFilter,
    favoriteFilter,
    zuordnungFilter,
  } = filters;
  return {
    search: deferredSearch.trim() || undefined,
    assignment: zuordnungFilter === 'meine' ? 'mine' : 'all',
    imported: anlageFilter.length === 1 ? anlageFilter[0] === 'fpp' : undefined,
    projectTypeName: typeFilter.length ? typeFilter : undefined,
    statusName: statusFilter.length ? statusFilter : undefined,
    ids:
      favoriteFilter.length === 1 && favoriteFilter[0] === 'favorited'
        ? favoriteIds
        : undefined,
    excludeIds:
      favoriteFilter.length === 1 &&
      favoriteFilter[0] === 'not-favorited' &&
      favoriteIds.length
        ? favoriteIds
        : undefined,
    sort: sortColumn,
    direction: sortDirection,
  };
};

/**
 * All/mine, search, and ordering apply before paging on the authorized server set.
 * @param params - Current table filters, ordering, favorites, and user identity.
 * @returns Loaded rows, continuation controls, and dataset-independent filter options.
 */
export const useProjectsTableData = (params: UseProjectsTableDataParams) => {
  const { currentUserId, filters } = params;
  const { t } = useTranslation('Dashboard');
  const deferredSearch = useDeferredValue(params.search);
  const projects = useProjectList(
    getProjectListFilters(params, deferredSearch),
  );
  const projectTypes = useLiveQuery((q) =>
    q.from({ projectTypes: projectTypesCollection }),
  );
  const statuses = useQuery(v1ProjectLogicListProjectStatusesOptions());
  const assignedProjects = useQuery({
    queryKey: ['project-list', 'assigned', currentUserId],
    queryFn: currentUserId
      ? async () => {
          const { data } = await v1ProjectLogicListProjects({
            query: { assignment: 'mine', limit: 1, offset: 0 },
            throwOnError: true,
          });
          return data;
        }
      : skipToken,
  });

  return {
    isLoading:
      projects.isLoading ||
      projectTypes.isLoading ||
      statuses.isLoading ||
      assignedProjects.isLoading,
    isError:
      projects.isError ||
      projectTypes.isError ||
      statuses.isError ||
      assignedProjects.isError,
    retry: () => {
      void projects.refetch();
      void projectTypesCollection.utils.refetch();
      void statuses.refetch();
      if (currentUserId) {
        void assignedProjects.refetch();
      }
    },
    projects: projects.data,
    hasNextPage: projects.hasNextPage,
    isFetchingNextPage: projects.isFetchingNextPage,
    fetchNextPage: projects.fetchNextPage,
    anlageOptions: [
      { label: t('ProjectsTable.anlageSpark'), value: 'spark' },
      { label: t('ProjectsTable.anlageFpp'), value: 'fpp' },
    ] satisfies { label: string; value: AnlageFilterValue }[],
    artOptions: deriveOptions(projectTypes.data.map((type) => type.name)),
    statusOptions: deriveOptions(
      (statuses.data ?? []).map((status) => status.name),
    ),
    favoriteOptions: [
      { label: t('ProjectsTable.favorited'), value: 'favorited' },
      { label: t('ProjectsTable.notFavorited'), value: 'not-favorited' },
    ] satisfies { label: string; value: FavoriteFilterValue }[],
    zuordnungOptions:
      assignedProjects.data?.length || filters.zuordnungFilter === 'meine'
        ? ([
            { label: t('ProjectsTable.zuordnungMeine'), value: 'meine' },
            { label: t('ProjectsTable.zuordnungAlle'), value: 'alle' },
          ] satisfies { label: string; value: ZuordnungFilterValue }[])
        : [],
  };
};
