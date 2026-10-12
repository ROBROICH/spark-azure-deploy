import { CollectionErrorAlert } from '@/features/project/fvp/main-screen/read-status/CollectionErrorAlert';
import { retryDocumentsTableReads } from '@/features/project/fvp/data/fvpResultReads';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useDocumentsTree } from '@/features/project/fvp/main-screen/data/read-model/useDocumentsTree';
import { useRequiredDocumentsTree } from '@/features/project/fvp/main-screen/data/read-model/useRequiredDocuments';
import { FvpTopicAssignmentProvider } from '@/features/project/fvp/main-screen/documents-card/documents-table/FvpTopicAssignmentContext';
import { Button } from '@/features/ui/button/Button';
import { getRouteApi } from '@tanstack/react-router';
import {
  type ExpandedState,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DOCUMENT_STATUS,
  type TreeNode,
} from '@/features/project/data/document-tree/documentTree.types';
import { createColumns } from './columns';
import { DocumentsTableSkeleton } from './DocumentsTableSkeleton';
import { DocumentsTableView } from './DocumentsTableView';
import { useDocumentsTableActions } from './useDocumentsTableActions';

const STATUS_FILTERS = {
  [DOCUMENT_STATUS.assigned]: 'assigned',
  [DOCUMENT_STATUS.unassigned]: 'unassigned',
  [DOCUMENT_STATUS.onRequestList]: 'requested',
} as const;
const route = getRouteApi('/verfahren/$verfahrenId/fvp/documents/');

// In preview mode the topic column is hidden, so the topic-assignment provider
// has no consumer. Passing a stable empty row set skips its file-id collection
// and `useLiveNodes` subscription entirely.
const NO_TOPIC_ASSIGNMENT_ROWS: TreeNode[] = [];

type DocumentsTableProps = {
  forceLoading?: boolean;
};

/**
 * Coordinates document tree data, request-list state, route filters, and table callbacks for the formal completeness documents view.
 *
 * @param props Optional loading override for parent-controlled skeleton rendering.
 * @returns Documents table content, loading skeleton, or collection error state.
 */
export const DocumentsTable = (props: DocumentsTableProps) => {
  const { forceLoading = false } = props;

  const { t } = useTranslation('FormalCompletenessCheck');
  const { verfahrenId } = route.useParams();
  // eslint-disable-next-line no-restricted-syntax -- expanded folder state is local table UI state
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const {
    search = '',
    previewDocumentId,
    documentTypeFilter: documentTypeFilterParam,
    statusFilter: statusFilterParam,
    allCollapsed,
  } = route.useSearch({
    select: (routeSearch) => ({
      search: routeSearch.search,
      previewDocumentId: routeSearch.previewDocumentId,
      documentTypeFilter: routeSearch.documentTypeFilter,
      statusFilter: routeSearch.statusFilter,
      allCollapsed: routeSearch.allCollapsed,
    }),
  });

  // eslint-disable-next-line no-restricted-syntax -- parsed route filters keep stable identity at the table's query boundary.
  const documentTypeFilter = useMemo(
    () => (documentTypeFilterParam ? documentTypeFilterParam.split(',') : []),
    [documentTypeFilterParam],
  );
  // eslint-disable-next-line no-restricted-syntax -- parsed route filters keep stable identity at the table's query boundary.
  const statusFilter = useMemo(
    () =>
      statusFilterParam?.split(',').flatMap((status) => {
        const value = STATUS_FILTERS[status as keyof typeof STATUS_FILTERS];
        return Object.hasOwn(STATUS_FILTERS, status) ? [value] : [];
      }),
    [statusFilterParam],
  );
  const { canMutateProject } = useCanMutateProject({
    requiredLevel: 'user',
  });

  const {
    treeData: documentsTreeData,
    isLoading: documentsTreeLoading,
    isError: documentsTreeError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useDocumentsTree(verfahrenId, {
    search: search.trim() || undefined,
    documentTypeId: documentTypeFilter.length ? documentTypeFilter : undefined,
    status: statusFilter,
  });
  const {
    tree: availableDocumentTypesStructured,
    isLoading: requiredTypesLoading,
    isError: requiredTypesError,
  } = useRequiredDocumentsTree(verfahrenId);

  // An active search force-expands all folders so matches are visible. This is
  // derived (not synced via effect) so clearing the search restores the user's
  // prior collapsed state instead of clobbering it.
  const tableExpanded = search ? true : expanded;

  // Reset row expansion when the URL `allCollapsed` command flips. `expanded`
  // is also driven by user row toggles via onExpandedChange, so this is a
  // signal reset, not derived state. Adjusting state during render (guarded by
  // the previous value) is React's recommended alternative to an effect-based
  // URL->state sync and avoids a post-paint expand/collapse flash.
  // eslint-disable-next-line no-restricted-syntax -- local previous-value tracker for the render-time reset, not URL-worthy or external-prop-synced state
  const [prevAllCollapsed, setPrevAllCollapsed] = useState(allCollapsed);
  if (prevAllCollapsed !== allCollapsed) {
    setPrevAllCollapsed(allCollapsed);
    setExpanded(allCollapsed ? {} : true);
  }

  // eslint-disable-next-line no-restricted-syntax -- column visibility is part of TanStack Table state and should remain stable until the preview selection changes
  const columnVisibility = useMemo(
    () => ({
      contents: true,
      status: !previewDocumentId,
      documentType: !previewDocumentId,
      topic: !previewDocumentId,
      action: !previewDocumentId,
    }),
    [previewDocumentId],
  );

  const {
    handleAddComment,
    handleFileClick,
    handleManageCustomDocumentTypes,
    handleRequestDocument,
    handleSelectDocumentType,
  } = useDocumentsTableActions({
    canMutateProject,
    verfahrenId,
  });

  // eslint-disable-next-line no-restricted-syntax -- TanStack Table column definitions must stay stable in this compiler-opt-out component to avoid resetting interactive table state
  const columns = useMemo(
    () =>
      createColumns({
        activeDocumentId: previewDocumentId,
        canMutateProject,
        onFileClick: handleFileClick,
        onSelectDocumentType: handleSelectDocumentType,
        onManageCustomDocumentTypes: handleManageCustomDocumentTypes,
        onRequestDocument: handleRequestDocument,
        onAddComment: handleAddComment,
        t,
        availableDocumentTypesStructured,
      }),
    [
      availableDocumentTypesStructured,
      canMutateProject,
      handleAddComment,
      handleFileClick,
      handleManageCustomDocumentTypes,
      handleRequestDocument,
      handleSelectDocumentType,
      previewDocumentId,
      t,
    ],
  );

  const table = useReactTable({
    data: documentsTreeData,
    columns,
    state: {
      expanded: tableExpanded,
      columnVisibility,
    },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row) => row.children,
    getRowCanExpand: (row) => row.original.kind === 'folder',
    getRowId: (row) => row.id,
  });

  const isTableLoading =
    forceLoading || documentsTreeLoading || requiredTypesLoading;

  if (isTableLoading) {
    return <DocumentsTableSkeleton />;
  }

  return (
    <div className="flex flex-col gap-4">
      {(documentsTreeError || requiredTypesError) && (
        <CollectionErrorAlert
          onRetry={() => retryDocumentsTableReads(verfahrenId)}
        />
      )}
      <FvpTopicAssignmentProvider
        canMutateProject={canMutateProject}
        rows={previewDocumentId ? NO_TOPIC_ASSIGNMENT_ROWS : documentsTreeData}
      >
        <DocumentsTableView table={table} />
      </FvpTopicAssignmentProvider>
      {hasNextPage && (
        <Button
          variant="secondary"
          size="sm"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {t('DocumentsCard.loadMore')}
        </Button>
      )}
    </div>
  );
};
