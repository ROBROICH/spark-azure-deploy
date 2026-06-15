import type { IdentityResponse } from '@/api-clients/identity-management-module';
import {
  getStatusBadgeVariant,
  getStatusLabel,
} from '@/features/main-page/list-screen/project-status/statusUtils';
import { StatusBadge } from '@/features/ui/status-badge/StatusBadge';
import { StarButton } from '@/features/ui/star-button/StarButton';
import { MAX_FAVORITES } from '@/features/project/data/project-favorites/useFavorites';
import { formatDate } from '@/i18n/formatDate';
import { Link } from '@tanstack/react-router';
import type { HeaderContext } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import type { TFunction } from 'i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Project } from '@/features/main-page/data/schemas/project.schema';
import { ProjectsTableImportedProjectBadge } from './ProjectsTableImportedProjectBadge';
import { createProjectOwnersColumnCell } from './ProjectsTableOwnersCell';

const columnHelper = createColumnHelper<Project>();

export type FavoriteColumnMeta = {
  favoriteIds: string[];
  favoriteLabel: string;
  favoriteProjectLabel: string;
  unfavoriteProjectLabel: string;
  favoriteLimitTooltip: string | undefined;
  onToggleFavorite: (id: string) => void;
};

type CreateProjectsTableColumnsParams = {
  t: TFunction<'Dashboard'>;
  locale: string;
  users: IdentityResponse[];
  usersIsError: boolean;
};

function renderNameCell(name: string, id: string) {
  return (
    <span className="relative [overflow-wrap:anywhere] break-words">
      {/* Overlay link gives keyboard users and screen readers a real navigation target */}
      <Link
        to="/verfahren/$verfahrenId"
        params={{ verfahrenId: id }}
        className="focus-ring absolute inset-0"
        aria-label={name}
      />
      {name}
    </span>
  );
}

function renderWrappingTextCell(value: string) {
  return <span className="[overflow-wrap:anywhere] break-words">{value}</span>;
}

function renderTypeBadge(projectTypeName: string) {
  return <StatusBadge variant="neutral">{projectTypeName}</StatusBadge>;
}

function renderStatusBadge(status: string, label: string) {
  return (
    <StatusBadge variant={getStatusBadgeVariant(status)}>{label}</StatusBadge>
  );
}

function renderTypeCell(cellContext: { row: { original: Project } }) {
  return renderTypeBadge(cellContext.row.original.projectTypeName);
}

function createStatusCell(t: TFunction<'Dashboard'>) {
  return (cellContext: { row: { original: Project } }) => {
    const { statusName } = cellContext.row.original;
    return renderStatusBadge(statusName, getStatusLabel(statusName, t));
  };
}

function createCreatedAtCell(locale: string) {
  return (cellContext: { row: { original: Project } }) => {
    const project = cellContext.row.original;

    return (
      <span className="inline-flex items-center gap-2">
        <span>{formatDate(project.originalCreatedAt, locale)}</span>
        {project.imported === true ? (
          <ProjectsTableImportedProjectBadge />
        ) : null}
      </span>
    );
  };
}

type SortableHeaderProps = {
  column: HeaderContext<Project, unknown>['column'];
  label: string;
  t: TFunction<'Dashboard'>;
};

const getSortHeaderAriaLabel = (
  t: TFunction<'Dashboard'>,
  label: string,
  sortDirection: false | 'asc' | 'desc',
): string => {
  if (sortDirection === 'asc') {
    return t('ProjectsTable.sortHeaderAscending', { column: label });
  }
  if (sortDirection === 'desc') {
    return t('ProjectsTable.sortHeaderDescending', { column: label });
  }
  return t('ProjectsTable.sortHeader', { column: label });
};

function renderSortableHeaderButton(props: SortableHeaderProps) {
  const { column, label, t } = props;
  const canSort = column.getCanSort();
  const sortDirection = column.getIsSorted();

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      column.getToggleSortingHandler()?.(event);
    }
  };

  if (!canSort) {
    return <span>{label}</span>;
  }

  const SortIcon = sortDirection === 'asc' ? ChevronUp : ChevronDown;

  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      onKeyDown={handleKeyDown}
      aria-label={getSortHeaderAriaLabel(t, label, sortDirection)}
      className="flex w-full cursor-pointer items-center justify-start gap-2 text-left"
    >
      <SortIcon
        className="size-4 shrink-0 text-text-secondary"
        aria-hidden="true"
      />
      <span>{label}</span>
    </button>
  );
}

function renderSortableHeader(
  ctx: HeaderContext<Project, unknown>,
  label: string,
  t: TFunction<'Dashboard'>,
) {
  return renderSortableHeaderButton({ column: ctx.column, label, t });
}

export function renderProjectsTableFavoriteCell(params: {
  favoriteColumn: FavoriteColumnMeta;
  projectId: string;
}) {
  const { favoriteColumn, projectId } = params;
  const isFavorite = favoriteColumn.favoriteIds.includes(projectId);

  return (
    <StarButton
      size="sm"
      isFavorite={isFavorite}
      onToggle={() => favoriteColumn.onToggleFavorite(projectId)}
      ariaLabel={
        isFavorite
          ? favoriteColumn.unfavoriteProjectLabel
          : favoriteColumn.favoriteProjectLabel
      }
      limitTooltip={favoriteColumn.favoriteLimitTooltip}
    />
  );
}

export function buildFavoriteColumnMeta(params: {
  t: TFunction<'Dashboard'>;
  favoriteIds: string[];
  canFavorite: boolean;
  onToggleFavorite: (id: string) => void;
}): FavoriteColumnMeta {
  const { t, favoriteIds, canFavorite, onToggleFavorite } = params;

  return {
    favoriteIds,
    favoriteLabel: t('myFavorites'),
    favoriteProjectLabel: t('ProjectsTable.favoriteProject'),
    unfavoriteProjectLabel: t('ProjectsTable.unfavoriteProject'),
    favoriteLimitTooltip: !canFavorite
      ? t('ProjectsTable.favoriteLimitReached', { count: MAX_FAVORITES })
      : undefined,
    onToggleFavorite,
  };
}

/** Defines the TanStack Table column model and centralizes its localized cell renderers. */
export const createProjectsTableColumns = (
  params: CreateProjectsTableColumnsParams,
) => {
  const { t, locale, users, usersIsError } = params;
  const usersById = new Map(users.map((user) => [user.userId, user]));
  const projectOwnersCell = createProjectOwnersColumnCell({
    t,
    usersById,
    usersIsError,
  });

  return [
    columnHelper.accessor('name', {
      header: (ctx) =>
        renderSortableHeader(ctx, t('ProjectsTable.projectName'), t),
      size: 200,
      cell: (ctx) => renderNameCell(ctx.row.original.name, ctx.row.original.id),
    }),
    columnHelper.accessor('internalProjectNumber', {
      header: (ctx) =>
        renderSortableHeader(ctx, t('ProjectsTable.aktenzeichen'), t),
      size: 150,
      cell: (ctx) =>
        renderWrappingTextCell(ctx.row.original.internalProjectNumber),
    }),
    columnHelper.accessor((row) => row.projectTypeName, {
      id: 'projectTypeName',
      header: (ctx) => renderSortableHeader(ctx, t('ProjectsTable.art'), t),
      size: 130,
      cell: renderTypeCell,
    }),
    columnHelper.display({
      id: 'verfahrensleitung',
      header: () => t('ProjectsTable.verfahrensleitung'),
      size: 120,
      cell: projectOwnersCell,
    }),
    columnHelper.accessor((row) => row.statusName, {
      id: 'statusName',
      header: (ctx) => renderSortableHeader(ctx, t('ProjectsTable.status'), t),
      size: 130,
      cell: createStatusCell(t),
    }),
    columnHelper.accessor('originalCreatedAt', {
      id: 'originalCreatedAt',
      header: (ctx) =>
        renderSortableHeader(ctx, t('ProjectsTable.createdAt'), t),
      size: 150,
      cell: createCreatedAtCell(locale),
    }),
    columnHelper.display({
      id: 'favorite',
      header: () => <span className="sr-only">{t('myFavorites')}</span>,
      size: 48,
      cell: () => null,
      enableSorting: false,
    }),
  ];
};
