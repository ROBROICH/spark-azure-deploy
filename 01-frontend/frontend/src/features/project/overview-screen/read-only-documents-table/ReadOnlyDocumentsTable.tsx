import { Button } from '@/features/ui/button/Button';
import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { cn } from '@/features/ui/style/cn';
import { getRouteApi } from '@tanstack/react-router';
import {
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectProcessingState } from '@/features/project/data/file-processing/useProjectProcessingState';
import { createReadOnlyColumns } from './readOnlyColumns';
import {
  collectFolderIds,
  filterNodesBySearch,
  sameFolderIdSet,
} from './readOnlyTree.utils';
import { useSelectedDocumentVersion } from './useSelectedDocumentVersion';
import { useReadOnlyDocumentsTree } from './useReadOnlyDocumentsTree';

const route = getRouteApi('/verfahren/$verfahrenId/');

/**
 * Read-only variant of the documents table with no action buttons or error rows.
 * Used on pages that only need to display documents without editing capabilities.
 */
export const ReadOnlyDocumentsTable = () => {
  'use no memo';

  const { t, i18n } = useTranslation('Project');
  // eslint-disable-next-line no-restricted-syntax -- expanded folder state is local table UI state
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const { verfahrenId } = route.useParams();
  const { search, previewDocumentId } = route.useSearch({
    select: (currentSearch) => ({
      search: currentSearch.search ?? '',
      previewDocumentId: currentSearch.previewDocumentId,
    }),
  });
  const navigate = route.useNavigate();
  const { hasActiveFileProcessing, isLoadingProcessingState } =
    useProjectProcessingState({
      projectId: verfahrenId,
    });
  const { selectedDocumentVersion } = useSelectedDocumentVersion();

  const { treeData, isLoading, isError, sourceDocumentsCount } =
    useReadOnlyDocumentsTree(verfahrenId, {
      documentVersion: selectedDocumentVersion,
    });

  // `useProjectProcessingState` already invalidates `['files', projectId]` on
  // the active → not-active transition; no duplicate edge-detect needed here.

  // eslint-disable-next-line no-restricted-syntax -- syncs expansion to treeData; render-time setState caused a two-click bug with TanStack Table. Re-expands folders when the folder-id set actually changes (e.g. after a ZIP upload adds folders), but bails out otherwise so we don't loop on referentially-new-but-equal expansion objects.
  useEffect(() => {
    if (isLoading || treeData.length === 0) {
      return;
    }
    const nextIds = collectFolderIds(treeData);
    setExpanded((prev) => (sameFolderIdSet(prev, nextIds) ? prev : nextIds));
  }, [isLoading, treeData]);

  // eslint-disable-next-line no-restricted-syntax -- expands all folders when search activates so matches are visible; gated on the folder-id set actually differing from current expansion to avoid a feedback loop with the effect above.
  useEffect(() => {
    if (!search) {
      return;
    }
    const nextIds = collectFolderIds(treeData);
    setExpanded((prev) => (sameFolderIdSet(prev, nextIds) ? prev : nextIds));
  }, [search, treeData]);

  // eslint-disable-next-line no-restricted-syntax -- passed as `data` to useReactTable, which performs referential equality checks; a new reference on each render would cause TanStack Table to rebuild its internal row model unnecessarily.
  const filteredData = useMemo(
    () => filterNodesBySearch(treeData, search),
    [treeData, search],
  );

  // eslint-disable-next-line no-restricted-syntax -- passed as controlled `columnVisibility` state to useReactTable; referential instability would trigger unnecessary column layout recalculations inside TanStack Table.
  const columnVisibility = useMemo(
    () => ({
      contents: true,
      versioning: !previewDocumentId,
    }),
    [previewDocumentId],
  );

  // eslint-disable-next-line no-restricted-syntax -- passed into createReadOnlyColumns which is itself memoized via useMemo below; an unstable callback identity would bust the columns memo on every render.
  const handleFileClick = useCallback(
    (documentId: string) => {
      navigate({
        search: (prev) => ({
          ...prev,
          previewDocumentId: documentId,
        }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  const contentsHeader = t('Documents.tableHeaders.contents');
  const versionHeader = t('Documents.tableHeaders.version');
  const language = i18n.language;
  const expandFolderLabel = t('Documents.tree.expandFolder', {
    folderName: '__FOLDER__',
  });
  const collapseFolderLabel = t('Documents.tree.collapseFolder', {
    folderName: '__FOLDER__',
  });

  // eslint-disable-next-line no-restricted-syntax -- passed into createReadOnlyColumns which is itself memoized below; unstable identity would bust the columns memo each render.
  const folderTranslations = useMemo(
    () => ({
      expandFolder: (folderName: string) =>
        expandFolderLabel.replace('__FOLDER__', folderName),
      collapseFolder: (folderName: string) =>
        collapseFolderLabel.replace('__FOLDER__', folderName),
    }),
    [expandFolderLabel, collapseFolderLabel],
  );

  // eslint-disable-next-line no-restricted-syntax -- passed as `columns` to useReactTable; TanStack Table re-derives its full column layout when the array reference changes, so identity must be stable across unrelated renders.
  const columns = useMemo(
    () =>
      createReadOnlyColumns(
        {
          activeDocumentId: previewDocumentId,
          onFileClick: handleFileClick,
        },
        {
          contentsHeader,
          versionHeader,
          language,
          folderTranslations,
        },
      ),
    [
      handleFileClick,
      previewDocumentId,
      contentsHeader,
      versionHeader,
      language,
      folderTranslations,
    ],
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      expanded,
      columnVisibility,
    },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row) => row.children,
    getRowCanExpand: (row) => row.original.kind === 'folder',
    getRowId: (row) => row.id,
  });

  if (
    isLoading ||
    (sourceDocumentsCount === 0 &&
      (hasActiveFileProcessing || isLoadingProcessingState))
  ) {
    return (
      <div className="overflow-x-auto rounded-lg border border-border-primary bg-neutral-white p-4">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border-primary bg-neutral-white py-12">
        <div className="flex flex-col gap-2 text-center">
          <p className="text-base font-medium tracking-tight text-text-primary">
            {t('Documents.errorState.title')}
          </p>
          <p className="text-sm text-text-secondary">
            {t('Documents.errorState.description')}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void queryClient.invalidateQueries({
              queryKey: ['files', verfahrenId],
            });
          }}
        >
          {t('Documents.errorState.retry')}
        </Button>
      </div>
    );
  }

  if (filteredData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border-primary bg-neutral-white py-12">
        <div className="mb-6 inline-block rounded-full bg-gray-100 p-5">
          <Search className="size-8 text-gray-400" aria-hidden />
        </div>
        <p className="text-secondary max-w-92.5 text-center text-sm">
          {t('Documents.emptyState')}
        </p>
      </div>
    );
  }

  const visibleRows = table.getRowModel().rows;

  return (
    <div className="overflow-hidden rounded-lg border border-border-primary bg-neutral-white">
      <table
        className="w-full table-fixed border-collapse"
        aria-label={t('Documents.tableAriaLabel')}
      >
        <thead className="sticky top-0 z-[5] bg-bg-secondary">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border-primary">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className={cn(
                    'px-2 py-[11px] text-left align-middle',
                    'text-sm font-medium tracking-tight text-text-primary',
                  )}
                  style={{ width: header.getSize() }}
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
        <tbody>
          {visibleRows.map((row) => {
            const isFolder = row.original.kind === 'folder';
            const isActiveDocument =
              !isFolder && row.original.id === previewDocumentId;

            return (
              <Fragment key={row.id}>
                <tr
                  aria-current={isActiveDocument ? 'true' : undefined}
                  className={cn(
                    'scroll-mt-14 border-b border-border-primary last:border-b-0',
                    isFolder
                      ? 'bg-bg-secondary select-none hover:bg-bg-tertiary'
                      : 'bg-neutral-white',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-2 align-middle',
                        cell.column.id === 'contents' ? 'py-0' : 'py-[11px]',
                      )}
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
