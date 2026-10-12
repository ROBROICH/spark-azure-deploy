import type { RowNode } from '@/features/project/data/document-tree/documentTreeTable';
import type { ExpandedState } from '@tanstack/react-table';

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
