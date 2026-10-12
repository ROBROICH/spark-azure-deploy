import { Button } from '@/features/ui/button/Button';
import { useOrganizationUsers } from '@/features/access-control/organization-users/organizationUsers.collection';
import { getDateLocale } from '@/i18n/dateLocale';
import {
  type SortingState,
  type Updater,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardErrorState } from '../../dashboard-screen/DashboardErrorState';
import {
  buildFavoriteColumnMeta,
  createProjectsTableColumns,
} from './ProjectsTable.columns';
import { ProjectsTableRow } from './ProjectsTableRow';
import { useProjectsTableFeatureContext } from './ProjectsTableFeatureContext';

const ARIA_SORT_BY_DIRECTION = {
  asc: 'ascending',
  desc: 'descending',
} as const satisfies Record<'asc' | 'desc', 'ascending' | 'descending'>;

const getAriaSort = (
  canSort: boolean,
  sorted: false | 'asc' | 'desc',
): 'ascending' | 'descending' | 'none' | undefined => {
  if (!canSort) {
    return undefined;
  }
  return sorted ? ARIA_SORT_BY_DIRECTION[sorted] : 'none';
};

/**
 * Owns the interactive projects table wiring between URL-backed sorting, favorite actions, and TanStack Table's manual memoization boundary.
 *
 * @returns Dashboard projects table with loading, sorting, and row actions.
 */
export const ProjectsTable = () => {
  // TanStack Table crashes under the React Compiler in this interactive table, so this component intentionally opts out and keeps table inputs stable manually.
  'use no memo';

  const {
    routeState: { sortColumn, sortDirection, onSortChange },
    favoriteIds,
    canFavorite,
    onToggleFavorite,
    projects,
    isLoading,
    isError,
    retry,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useProjectsTableFeatureContext();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('Dashboard');
  const locale = getDateLocale(i18n.language);
  const { data: organizationUsers, isError: isOrganizationUsersError } =
    useOrganizationUsers();

  // eslint-disable-next-line no-restricted-syntax -- this "use no memo" table passes live favorite state into row star cells, so keep that input stable until favorite labels or ids change.
  const favoriteColumnMeta = useMemo(
    () =>
      buildFavoriteColumnMeta({
        t,
        favoriteIds,
        canFavorite,
        onToggleFavorite,
      }),
    [t, favoriteIds, canFavorite, onToggleFavorite],
  );

  // eslint-disable-next-line no-restricted-syntax -- this "use no memo" table passes controlled sorting into TanStack Table, so the sorting state identity should only change when the URL-backed sort values change.
  const sortingState = useMemo(
    () => [{ id: sortColumn, desc: sortDirection === 'desc' }],
    [sortColumn, sortDirection],
  );

  // eslint-disable-next-line no-restricted-syntax -- this "use no memo" table should keep its column definitions stable across unrelated search and data updates.
  const columns = useMemo(
    () =>
      createProjectsTableColumns({
        t,
        locale,
        users: organizationUsers,
        usersIsError: isOrganizationUsersError,
      }),
    [t, locale, organizationUsers, isOrganizationUsersError],
  );

  // eslint-disable-next-line no-restricted-syntax -- this "use no memo" table gives TanStack Table a stable sorting callback so header interactions do not rebuild the full table wiring on every render.
  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next =
        typeof updater === 'function' ? updater(sortingState) : updater;
      onSortChange(next[0]?.id ?? sortColumn, next[0]?.desc ? 'desc' : 'asc');
    },
    [onSortChange, sortColumn, sortingState],
  );

  const table = useReactTable({
    data: projects,
    columns,
    state: {
      sorting: sortingState,
    },
    manualSorting: true,
    enableSortingRemoval: false,
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const rows = table.getRowModel().rows;

  const navigateToProject = (projectId: string) => {
    void navigate({
      to: '/verfahren/$verfahrenId',
      params: { verfahrenId: projectId },
    });
  };

  if (isError) {
    return (
      <DashboardErrorState
        message={t('ProjectsTable.loadError')}
        onRetry={retry}
      />
    );
  }

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="overflow-hidden rounded-lg border border-border-primary bg-neutral-white p-8 text-center text-sm text-text-secondary"
      >
        {t('ProjectsTable.loadingProjects')}
      </div>
    );
  }

  const tableHead = (className?: string) => (
    <thead className={className}>
      {table.getHeaderGroups().map((headerGroup) => (
        <tr
          key={headerGroup.id}
          className="border-b border-border-primary bg-bg-secondary"
        >
          {headerGroup.headers.map((header) => (
            <th
              key={header.id}
              scope="col"
              aria-sort={getAriaSort(
                header.column.getCanSort(),
                header.column.getIsSorted(),
              )}
              className="px-3 py-[11px] text-left text-sm font-medium tracking-tight text-text-primary"
              style={{
                width: `${(header.getSize() / table.getTotalSize()) * 100}%`,
              }}
            >
              {header.isPlaceholder
                ? null
                : flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
            </th>
          ))}
        </tr>
      ))}
    </thead>
  );

  if (rows.length === 0) {
    return (
      <div
        className="min-w-0 overflow-x-auto overflow-y-clip rounded-lg border border-border-primary"
        role="region"
        aria-label={t('ProjectsTable.tableAriaLabel')}
        tabIndex={0}
      >
        <table className="w-full min-w-[58rem] table-fixed border-spacing-0">
          {tableHead()}
          <tbody>
            <tr>
              <td
                colSpan={table.getVisibleLeafColumns().length}
                className="px-3 py-8 text-center text-sm text-text-secondary"
              >
                {t('ProjectsTable.noProjectsFound')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div
      className="min-w-0 overflow-x-auto overflow-y-clip rounded-lg border border-border-primary"
      role="region"
      aria-label={t('ProjectsTable.tableAriaLabel')}
      tabIndex={0}
    >
      <table className="w-full min-w-[58rem] table-fixed border-spacing-0">
        {tableHead()}
        <tbody>
          {rows.map((row) => (
            <ProjectsTableRow
              key={row.id}
              favoriteColumn={favoriteColumnMeta}
              row={row}
              onNavigate={navigateToProject}
            />
          ))}
        </tbody>
      </table>
      {hasNextPage && (
        <div className="flex justify-center border-t border-border-primary p-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage
              ? t('ProjectsTable.loadingProjects')
              : t('ProjectsTable.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
};
