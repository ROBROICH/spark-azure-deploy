import { createSearchMatcher } from '@/features/shared/search/createSearchMatcher';

import type { RowNode } from './columns.shared';

type DocumentRowNode = Extract<RowNode, { kind: 'document' }>;

type FilterState = {
  documentTypeFilters: string[];
  hasSearch: boolean;
  hasStatusFilter: boolean;
  hasTypeFilter: boolean;
  requestedIds: Set<string>;
  searchMatcher: ReturnType<typeof createSearchMatcher>;
  statusFilters: string[];
};

const REQUEST_LIST_STATUS = 'Auf Nachforderungsliste';
const REQUEST_LIST_EXCLUDED_STATUSES = new Set([
  'Gelöscht',
  'Nicht zugeordnet',
]);

const projectFolderChildren = (
  children: RowNode[],
  visitNode: (node: RowNode) => RowNode | null,
) => {
  const nextChildren: RowNode[] = [];
  let hasChildChanges = false;

  for (const child of children) {
    const nextChild = visitNode(child);
    if (!nextChild) {
      hasChildChanges = true;
      continue;
    }

    if (nextChild !== child) {
      hasChildChanges = true;
    }

    nextChildren.push(nextChild);
  }

  return {
    nextChildren,
    hasChildChanges,
  };
};

const getProjectedStatus = (
  node: DocumentRowNode,
  requestedIds: Set<string>,
): DocumentRowNode['status'] => {
  if (
    REQUEST_LIST_EXCLUDED_STATUSES.has(node.status) ||
    !requestedIds.has(node.id)
  ) {
    return node.status;
  }

  return REQUEST_LIST_STATUS;
};

const matchesSearch = (node: DocumentRowNode, filters: FilterState) =>
  !filters.hasSearch ||
  filters.searchMatcher(node.filename) ||
  filters.searchMatcher(node.linkedDocumentType?.name);

const matchesType = (node: DocumentRowNode, filters: FilterState) =>
  !filters.hasTypeFilter ||
  (node.linkedDocumentType &&
    filters.documentTypeFilters.includes(node.linkedDocumentType.id));

const matchesStatus = (
  status: DocumentRowNode['status'],
  filters: FilterState,
) => !filters.hasStatusFilter || filters.statusFilters.includes(status);

const matchesDocumentFilters = (
  node: DocumentRowNode,
  status: DocumentRowNode['status'],
  filters: FilterState,
) =>
  matchesSearch(node, filters) &&
  matchesType(node, filters) &&
  matchesStatus(status, filters);

const projectDocumentNode = (
  node: DocumentRowNode,
  filters: FilterState,
): RowNode | null => {
  const status = getProjectedStatus(node, filters.requestedIds);
  if (!matchesDocumentFilters(node, status, filters)) {
    return null;
  }

  return status === node.status ? node : { ...node, status };
};

/**
 * Applies search, type, status, and request-list projection while preserving folder hierarchy.
 */
export const projectAndFilterNodes = (
  nodes: RowNode[],
  search: string,
  documentTypeFilters: string[],
  statusFilters: string[],
  requestedIds: Set<string>,
): RowNode[] => {
  const hasSearch = !!search;
  const hasTypeFilter = documentTypeFilters.length > 0;
  const hasStatusFilter = statusFilters.length > 0;

  if (
    !hasSearch &&
    !hasTypeFilter &&
    !hasStatusFilter &&
    requestedIds.size === 0
  ) {
    return nodes;
  }

  const searchMatcher = createSearchMatcher(search);
  const filters: FilterState = {
    documentTypeFilters,
    hasSearch,
    hasStatusFilter,
    hasTypeFilter,
    requestedIds,
    searchMatcher,
    statusFilters,
  };

  /** Recursively filters each branch while preserving ancestor folders for matching descendants. */
  const visitNode = (node: RowNode): RowNode | null => {
    if (node.kind === 'folder') {
      const { nextChildren, hasChildChanges } = projectFolderChildren(
        node.children,
        visitNode,
      );

      if (nextChildren.length === 0) {
        return null;
      }
      if (!hasChildChanges) {
        return node;
      }

      return { ...node, children: nextChildren };
    }

    return projectDocumentNode(node, filters);
  };

  const result: RowNode[] = [];
  for (const node of nodes) {
    const nextNode = visitNode(node);
    if (nextNode) {
      result.push(nextNode);
    }
  }

  return result;
};
