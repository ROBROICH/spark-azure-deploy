import type { RowNode } from '@/features/project/data/document-tree/documentTreeTable';
import { createSearchMatcher } from '@/features/shared/search/createSearchMatcher';
import type { ExpandedState } from '@tanstack/react-table';

/**
 * Recurses through `nodes` filtering by a prebuilt search matcher. The matcher
 * is built once by the public entry point so it is not reallocated per branch.
 */
const filterNodesByMatcher = (
  nodes: RowNode[],
  matcher: (value: string | null | undefined) => boolean,
): RowNode[] => {
  return nodes
    .map((node) => {
      if (node.kind === 'folder') {
        const filtered = filterNodesByMatcher(node.children, matcher);
        if (filtered.length > 0) {
          return { ...node, children: filtered };
        }
        if (matcher(node.title)) {
          return { ...node, children: node.children };
        }
        return null;
      }

      const isMatch =
        matcher(node.filename) || matcher(node.linkedDocumentType?.name);

      return isMatch ? node : null;
    })
    .filter((n): n is RowNode => n !== null);
};

export const filterNodesBySearch = (
  nodes: RowNode[],
  search: string,
): RowNode[] => {
  if (!search) {
    return nodes;
  }

  return filterNodesByMatcher(nodes, createSearchMatcher(search));
};

export const collectFolderIds = (nodes: RowNode[]): Record<string, boolean> => {
  const ids: Record<string, boolean> = {};
  /**
   * Recurses depth-first through the tree, collecting the id of every folder
   * node into `ids` so the table can expand all branches.
   */
  const walk = (ns: RowNode[]) => {
    for (const node of ns) {
      if (node.kind === 'folder') {
        ids[node.id] = true;
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
};

export const sameFolderIdSet = (
  a: ExpandedState,
  b: Record<string, boolean>,
): boolean => {
  if (a === true) {
    return false;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of bKeys) {
    if (!a[key]) {
      return false;
    }
  }
  return true;
};
