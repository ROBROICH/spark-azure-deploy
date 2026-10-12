import { administrativeFileDraftErrors } from "../errors.ts";

export interface ExportNode {
  id: string;
  parentVaeNodeId: string | null;
  title: string;
  text: string;
  order: number;
  isHidden: boolean;
  isDeleted: boolean;
}

export interface ExportTreeNode {
  id: string;
  title: string;
  text: string;
  order: number;
  children: ExportTreeNode[];
}

export function buildExportTree(nodes: readonly ExportNode[]): ExportTreeNode[] {
  const visible = nodes.filter(({ isHidden, isDeleted }) => !isHidden && !isDeleted);
  const treeById = new Map<string, ExportTreeNode>(
    visible.map(
      (node) =>
        [
          node.id,
          {
            id: node.id,
            title: node.title,
            text: node.text,
            order: node.order,
            children: [],
          } satisfies ExportTreeNode,
        ],
    ),
  );
  const roots: ExportTreeNode[] = [];
  for (const source of visible) {
    const node = treeById.get(source.id)!;
    const parent =
      source.parentVaeNodeId === null ? undefined : treeById.get(source.parentVaeNodeId);
    if (parent === undefined || parent === node) roots.push(node);
    else parent.children.push(node);
  }
  let reached = 0;
  const sort = (items: ExportTreeNode[]) => {
    items.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    for (const item of items) {
      reached++;
      sort(item.children);
    }
  };
  sort(roots);
  if (reached !== visible.length) throw administrativeFileDraftErrors.INVALID_EXPORT_STRUCTURE();
  return roots;
}
