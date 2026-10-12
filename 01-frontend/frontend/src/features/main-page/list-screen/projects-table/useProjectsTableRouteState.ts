import { startTransition } from 'react';
import type { AnlageFilterValue } from './ProjectsTable.constants';
import type {
  FavoriteFilterValue,
  TableFilters,
  ZuordnungFilterValue,
} from './ProjectsTable.utils';
import type { ProjectsTableSearchParams } from './projectsTable.search';

export type ProjectsTableNavigateFn = (params: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  resetScroll: boolean;
  replace?: boolean;
}) => void;

type UseProjectsTableRouteStateProps = {
  navigate: ProjectsTableNavigateFn;
  searchState: ProjectsTableSearchParams;
};

export type ProjectsTableRouteState = {
  committedSearch: string;
  onCommittedSearchChange: (value: string) => void;
  filters: TableFilters;
  sortColumn: NonNullable<ProjectsTableSearchParams['sortColumn']>;
  sortDirection: 'asc' | 'desc';
  onSortChange: (
    columnId: string | undefined,
    direction: 'asc' | 'desc' | undefined,
  ) => void;
};

const DEFAULT_SORT = {
  column: 'originalCreatedAt',
  direction: 'desc',
} as const;

type SearchPatch = Partial<
  Record<
    | 'search'
    | 'anlageFilter'
    | 'typeFilter'
    | 'statusFilter'
    | 'favoriteFilter'
    | 'zuordnungFilter'
    | 'sortColumn'
    | 'sortDirection',
    string | string[] | undefined
  >
>;

const updateSearch = (props: {
  patch: SearchPatch;
  navigate: ProjectsTableNavigateFn;
  replace?: boolean;
}) => {
  const { patch, navigate, replace } = props;

  startTransition(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        ...patch,
      }),
      resetScroll: false,
      replace,
    });
  });
};

const createArrayFilterHandler = <TValue extends string>(
  key: 'anlageFilter' | 'typeFilter' | 'statusFilter' | 'favoriteFilter',
  navigate: ProjectsTableNavigateFn,
) => {
  return (value: TValue[]) => {
    updateSearch({
      patch: {
        [key]: value.length ? value : undefined,
      },
      navigate,
      replace: true,
    });
  };
};

/**
 * Maps URL-backed projects table search params to a feature-friendly route state API.
 * The returned handlers are the single write path for search, sorting, filters,
 * and create-project dialog state, so toolbar and table consumers can stay free
 * of manual TanStack Router wiring.
 */
export const useProjectsTableRouteState = (
  props: UseProjectsTableRouteStateProps,
): ProjectsTableRouteState => {
  const { navigate, searchState } = props;
  const {
    search = '',
    sortColumn = DEFAULT_SORT.column,
    sortDirection = DEFAULT_SORT.direction,
    anlageFilter = [],
    typeFilter = [],
    statusFilter = [],
    favoriteFilter = [],
    zuordnungFilter = 'alle',
  } = searchState;
  return {
    committedSearch: search,
    onCommittedSearchChange: (value) => {
      updateSearch({
        patch: {
          search: value || undefined,
        },
        navigate,
      });
    },
    filters: {
      anlageFilter,
      typeFilter,
      statusFilter,
      favoriteFilter: favoriteFilter as FavoriteFilterValue[],
      zuordnungFilter: zuordnungFilter as ZuordnungFilterValue,
      onAnlageFilterChange: createArrayFilterHandler<AnlageFilterValue>(
        'anlageFilter',
        navigate,
      ),
      onTypeFilterChange: createArrayFilterHandler('typeFilter', navigate),
      onStatusFilterChange: createArrayFilterHandler('statusFilter', navigate),
      onFavoriteFilterChange: createArrayFilterHandler<FavoriteFilterValue>(
        'favoriteFilter',
        navigate,
      ),
      onZuordnungFilterChange: (value: ZuordnungFilterValue) => {
        updateSearch({
          patch: { zuordnungFilter: value === 'alle' ? undefined : value },
          navigate,
          replace: true,
        });
      },
    },
    sortColumn,
    sortDirection,
    onSortChange: (columnId, direction) => {
      updateSearch({
        patch: {
          sortColumn: columnId ?? DEFAULT_SORT.column,
          sortDirection: direction ?? DEFAULT_SORT.direction,
        },
        navigate,
      });
    },
  };
};
