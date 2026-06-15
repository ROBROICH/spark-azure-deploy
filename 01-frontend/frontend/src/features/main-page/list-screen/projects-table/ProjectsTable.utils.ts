import type { Project } from '../../data/schemas/project.schema';
import { createSearchMatcher } from '@/features/shared/search/createSearchMatcher';
import type { AnlageFilterValue } from './ProjectsTable.constants';

export const deriveOptions = (values: (string | undefined)[]) =>
  [...new Set(values)]
    .filter((value): value is string => Boolean(value))
    .sort()
    .map((value) => ({ label: value, value }));

export type FavoriteFilterValue = 'favorited' | 'not-favorited';
export type ZuordnungFilterValue = 'meine' | 'alle';

export type TableFilters = {
  anlageFilter: AnlageFilterValue[];
  typeFilter: string[];
  statusFilter: string[];
  favoriteFilter: FavoriteFilterValue[];
  zuordnungFilter: ZuordnungFilterValue;
  onAnlageFilterChange: (value: AnlageFilterValue[]) => void;
  onTypeFilterChange: (value: string[]) => void;
  onStatusFilterChange: (value: string[]) => void;
  onFavoriteFilterChange: (value: FavoriteFilterValue[]) => void;
  onZuordnungFilterChange: (value: ZuordnungFilterValue) => void;
};

type FilterProjectsParams = {
  projects: Project[];
  anlageFilter: AnlageFilterValue[];
  typeFilter: string[];
  statusFilter: string[];
  favoriteFilter: FavoriteFilterValue[];
  zuordnungFilter: ZuordnungFilterValue;
  currentUserId: string | undefined;
  favoriteIds: string[];
  search: string;
};

/**
 * Filters a list of projects based on type, status, favorite, zuordnung, and search criteria.
 * Applies each active filter in sequence and returns only the matching projects.
 * @param params - The filter parameters including projects list and all active filter values.
 * @returns The filtered list of projects.
 */
export const filterProjects = (params: FilterProjectsParams): Project[] => {
  const {
    projects,
    anlageFilter,
    typeFilter,
    statusFilter,
    favoriteFilter,
    zuordnungFilter,
    currentUserId,
    favoriteIds,
    search,
  } = params;

  let data = projects;

  if (zuordnungFilter === 'meine') {
    // Fail closed: when "meine" is active but the current user identity is
    // not resolved, we cannot determine ownership/membership, so no project
    // may be shown. Returning all projects here would leak the full list.
    if (!currentUserId) {
      return [];
    }
    data = data.filter(
      (project) =>
        project.owners?.includes(currentUserId) ||
        project.members?.includes(currentUserId),
    );
  }

  if (anlageFilter.length > 0) {
    const showSpark = anlageFilter.includes('spark');
    const showFpp = anlageFilter.includes('fpp');

    if (showSpark && !showFpp) {
      data = data.filter((project) => project.imported !== true);
    } else if (showFpp && !showSpark) {
      data = data.filter((project) => project.imported === true);
    }
  }

  if (typeFilter.length > 0) {
    data = data.filter((project) =>
      typeFilter.includes(project.projectTypeName),
    );
  }

  if (statusFilter.length > 0) {
    data = data.filter((project) => statusFilter.includes(project.statusName));
  }

  if (favoriteFilter.length > 0) {
    const showFavorited = favoriteFilter.includes('favorited');
    const showNotFavorited = favoriteFilter.includes('not-favorited');

    if (showFavorited && !showNotFavorited) {
      data = data.filter((project) => favoriteIds.includes(project.id));
    } else if (showNotFavorited && !showFavorited) {
      data = data.filter((project) => !favoriteIds.includes(project.id));
    }
  }

  const queryValue = search.trim();
  if (!queryValue) {
    return data;
  }

  const matchesSearch = createSearchMatcher(queryValue);
  return data.filter(
    (project) =>
      matchesSearch(project.name) ||
      matchesSearch(project.internalProjectNumber) ||
      matchesSearch(project.statusName) ||
      matchesSearch(project.projectTypeName),
  );
};
