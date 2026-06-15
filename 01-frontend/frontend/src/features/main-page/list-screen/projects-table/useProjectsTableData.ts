import { useDeferredValue, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  projectsCollection,
  useAllProjects,
} from '@/features/project/data/collections/projects.collection';
import type { AnlageFilterValue } from './ProjectsTable.constants';
import {
  deriveOptions,
  filterProjects,
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
};

/** Refetches the projects collection so a failed load can recover on retry. */
const retryProjects = () => {
  void projectsCollection.utils.refetch();
};

/**
 * Derives the sorted, filtered project list and the localized filter options for
 * the projects table. Applies search, type, status, favorite, and zuordnung
 * filters to the projects collection.
 *
 * @param params - The search string, active filter values, favorite IDs, and current user ID.
 * @returns The filtered projects, loading/error state, a retry callback, and the table filter options.
 */
export const useProjectsTableData = (params: UseProjectsTableDataParams) => {
  const { search, filters, favoriteIds, currentUserId } = params;
  const {
    anlageFilter,
    typeFilter,
    statusFilter,
    favoriteFilter,
    zuordnungFilter,
  } = filters;
  const { t } = useTranslation('Dashboard');
  const deferredSearch = useDeferredValue(search);
  const { data: projects, isLoading, isError } = useAllProjects();

  // eslint-disable-next-line no-restricted-syntax -- stable sort identity avoids re-filtering on unrelated renders
  const projectsSortedByUpdatedAt = useMemo(
    () =>
      [...projects].sort((a, b) => {
        const tA = new Date(a.updatedAt).getTime();
        const tB = new Date(b.updatedAt).getTime();
        return tB - tA;
      }),
    [projects],
  );

  const filteredProjects = isLoading
    ? []
    : filterProjects({
        projects: projectsSortedByUpdatedAt,
        anlageFilter,
        typeFilter,
        statusFilter,
        favoriteFilter,
        zuordnungFilter,
        currentUserId,
        favoriteIds,
        search: deferredSearch,
      });

  const hasAssignedProjects =
    currentUserId !== undefined &&
    projects.some(
      (p) =>
        p.owners?.includes(currentUserId) || p.members?.includes(currentUserId),
    );

  return {
    isLoading,
    isError,
    retry: retryProjects,
    projects: filteredProjects,
    anlageOptions: [
      {
        label: t('ProjectsTable.anlageSpark'),
        value: 'spark',
      },
      { label: t('ProjectsTable.anlageFpp'), value: 'fpp' },
    ] satisfies { label: string; value: AnlageFilterValue }[],
    artOptions: deriveOptions(
      projects.map((project) => project.projectTypeName),
    ),
    statusOptions: deriveOptions(projects.map((project) => project.statusName)),
    favoriteOptions: [
      { label: t('ProjectsTable.favorited'), value: 'favorited' },
      { label: t('ProjectsTable.notFavorited'), value: 'not-favorited' },
    ] satisfies { label: string; value: FavoriteFilterValue }[],
    zuordnungOptions: hasAssignedProjects
      ? ([
          { label: t('ProjectsTable.zuordnungMeine'), value: 'meine' },
          { label: t('ProjectsTable.zuordnungAlle'), value: 'alle' },
        ] satisfies { label: string; value: ZuordnungFilterValue }[])
      : [],
  };
};
