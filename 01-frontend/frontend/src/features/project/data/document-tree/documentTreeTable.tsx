import {
  DOCUMENT_STATUS,
  type TreeNode,
} from '@/features/project/data/document-tree/documentTree.types';

export type RowNode = TreeNode;

export const renderIndentGuides = (depth: number) =>
  Array.from({ length: depth }, (_, index) => (
    <span key={index} className="flex w-6 shrink-0 justify-center self-stretch">
      <span className="w-px bg-border-primary" />
    </span>
  ));

/**
 * Recursively counts folder descendants.
 * The recursion walks every subtree once and excludes deleted documents from totals.
 */
export function countDocumentsInFolder(node: TreeNode): {
  total: number;
  available: number;
} {
  if (node.kind === 'document') {
    if (node.isDeleted) {
      return { total: 0, available: 0 };
    }

    return {
      total: 1,
      available: node.status === DOCUMENT_STATUS.assigned ? 1 : 0,
    };
  }

  let total = 0;
  let available = 0;

  for (const child of node.children) {
    const counts = countDocumentsInFolder(child);
    total += counts.total;
    available += counts.available;
  }

  return { total, available };
}
