import { CollectionErrorAlert } from '@/features/project/fvp/main-screen/read-status/CollectionErrorAlert';
import { retryDocumentsTableReads } from '@/features/project/fvp/data/fvpResultReads';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useDocumentsTree } from '@/features/project/fvp/main-screen/data/read-model/useDocumentsTree';
import { useRequiredDocumentsTree } from '@/features/project/fvp/main-screen/data/read-model/useRequiredDocuments';
import { projectAndFilterNodes } from '@/features/project/fvp/main-screen/documents-card/documents-table/DocumentsTable.filters';
import { FvpTopicAssignmentProvider } from '@/features/project/fvp/main-screen/documents-card/documents-table/FvpTopicAssignmentContext';
import { requestItemsCollection } from '@/features/project/nachforderungen/data/collections/requestItems.collection';
import {
  getRequestItemSourceItemId,
  getRequestItemSourceType,
} from '@/features/project/nachforderungen/data/schemas/requestItem.schema';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import {
  type ExpandedState,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TreeNode } from '@/features/project/data/document-tree/documentTree.types';
import { createColumns } from './columns';
import { DocumentsTableSkeleton } from './DocumentsTableSkeleton';
import { DocumentsTableView } from './DocumentsTableView';
import { useDocumentsTableActions } from './useDocumentsTableActions';

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
  'use no memo';

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

  // eslint-disable-next-line no-restricted-syntax -- the parsed search filter must keep stable identity for the compiler-opt-out table state
  const documentTypeFilter = useMemo(
    () => (documentTypeFilterParam ? documentTypeFilterParam.split(',') : []),
    [documentTypeFilterParam],
  );
  // eslint-disable-next-line no-restricted-syntax -- the parsed search filter must keep stable identity for the compiler-opt-out table state
  const statusFilter = useMemo(
    () => (statusFilterParam ? statusFilterParam.split(',') : []),
    [statusFilterParam],
  );
  const { canMutateProject } = useCanMutateProject({
    requiredLevel: 'user',
  });

  const {
    treeData: documentsTreeData,
    isLoading: documentsTreeLoading,
    isError: documentsTreeError,
  } = useDocumentsTree(verfahrenId);
  const {
    data: requestItems,
    isLoading: requestItemsLoading,
    isError: requestItemsError,
  } = useLiveQuery((q) =>
    q
      .from({ items: requestItemsCollection })
      .where(({ items }) => eq(items.projectId, verfahrenId)),
  );
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

  // eslint-disable-next-line no-restricted-syntax -- deriving the requested-id set once per request-items change avoids rebuilding table filter inputs in this compiler-opt-out component
  const requestedIds = useMemo(
    () =>
      new Set(
        requestItems
          .filter((item) => {
            const sourceType = getRequestItemSourceType(item);
            return (
              sourceType === 'tableOfContents' ||
              sourceType === 'requiredDocuments'
            );
          })
          .map((item) => getRequestItemSourceItemId(item))
          .filter((id): id is string => id !== undefined),
      ),
    [requestItems],
  );

  // eslint-disable-next-line no-restricted-syntax -- the projected tree should only change when its real filter inputs change in this compiler-opt-out component
  const filteredData = useMemo(
    () =>
      projectAndFilterNodes(
        documentsTreeData,
        search,
        documentTypeFilter,
        statusFilter,
        requestedIds,
      ),
    [documentsTreeData, requestedIds, search, documentTypeFilter, statusFilter],
  );

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
    handleConfirmDocumentType,
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
        onConfirmDocumentType: handleConfirmDocumentType,
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
      handleConfirmDocumentType,
      handleFileClick,
      handleManageCustomDocumentTypes,
      handleRequestDocument,
      handleSelectDocumentType,
      previewDocumentId,
      t,
    ],
  );

  const table = useReactTable({
    data: filteredData,
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
    forceLoading ||
    documentsTreeLoading ||
    requestItemsLoading ||
    requiredTypesLoading;

  if (isTableLoading) {
    return <DocumentsTableSkeleton />;
  }

  return (
    <div className="flex flex-col gap-4">
      {(documentsTreeError || requestItemsError || requiredTypesError) && (
        <CollectionErrorAlert
          onRetry={() => retryDocumentsTableReads(verfahrenId)}
        />
      )}
      <FvpTopicAssignmentProvider
        canMutateProject={canMutateProject}
        rows={previewDocumentId ? NO_TOPIC_ASSIGNMENT_ROWS : filteredData}
      >
        <DocumentsTableView table={table} />
      </FvpTopicAssignmentProvider>
    </div>
  );
};
