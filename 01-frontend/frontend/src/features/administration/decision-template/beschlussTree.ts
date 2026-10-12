import type { BeschlussNode } from '../data/usecaseApi';

export type BeschlussTreeNode = {
  node: BeschlussNode;
  children: BeschlussTreeNode[];
};

const compareSiblingNodes = (left: BeschlussNode, right: BeschlussNode) => {
  if (left.order !== right.order) {
    return left.order - right.order;
  }

  return left.id.localeCompare(right.id);
};

const parentWouldCycle = (
  nodeId: string,
  parentId: string | null,
  nodesById: ReadonlyMap<string, BeschlussNode>,
): boolean => {
  if (!parentId) {
    return false;
  }

  if (parentId === nodeId) {
    return true;
  }

  const seen = new Set<string>([nodeId]);
  let currentId: string | null = parentId;

  while (currentId) {
    if (seen.has(currentId)) {
      return true;
    }

    seen.add(currentId);
    currentId = nodesById.get(currentId)?.parent_vae_node_id ?? null;
  }

  return false;
};

/**
 * Builds a Beschluss template tree from a flat node list. Roots are nodes
 * whose parent is null, missing, or would form a cycle. Children are ordered
 * by `order`, then id.
 *
 * @param nodes Flat Beschluss nodes from the usecase document.
 * @returns Root tree nodes with nested children.
 */
export const buildBeschlussTree = (
  nodes: ReadonlyArray<BeschlussNode>,
): BeschlussTreeNode[] => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const treeNodesById = new Map<string, BeschlussTreeNode>(
    nodes.map((node) => [node.id, { node, children: [] }]),
  );
  const roots: BeschlussTreeNode[] = [];

  const sorted = [...nodes].sort(compareSiblingNodes);
  for (const node of sorted) {
    const treeNode = treeNodesById.get(node.id);
    if (!treeNode) {
      continue;
    }

    const parentId = node.parent_vae_node_id;
    const parentTree = parentId ? treeNodesById.get(parentId) : undefined;
    if (
      !parentId ||
      !parentTree ||
      parentWouldCycle(node.id, parentId, nodesById)
    ) {
      roots.push(treeNode);
      continue;
    }

    parentTree.children.push(treeNode);
  }

  return roots;
};

/**
 * Collects a node id and every descendant id. Cycle-safe so a broken parent
 * chain cannot loop forever during removal.
 *
 * @param nodes Flat Beschluss nodes.
 * @param rootId Subtree root to remove.
 * @returns Ids that must be dropped with that node.
 */
export const collectSubtreeIds = (
  nodes: ReadonlyArray<BeschlussNode>,
  rootId: string,
): Set<string> => {
  const childrenByParent = new Map<string | null, BeschlussNode[]>();
  for (const node of nodes) {
    const parentId = node.parent_vae_node_id;
    const siblings = childrenByParent.get(parentId);
    if (siblings) {
      siblings.push(node);
    } else {
      childrenByParent.set(parentId, [node]);
    }
  }

  const ids = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || ids.has(currentId)) {
      continue;
    }

    ids.add(currentId);
    const children = childrenByParent.get(currentId) ?? [];
    for (const child of children) {
      stack.push(child.id);
    }
  }

  return ids;
};

export const siblingsOf = (
  nodes: ReadonlyArray<BeschlussNode>,
  nodeId: string,
): BeschlussNode[] => {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return [];
  }

  return nodes
    .filter(
      (candidate) => candidate.parent_vae_node_id === node.parent_vae_node_id,
    )
    .sort(compareSiblingNodes);
};

/**
 * Moves a node among its siblings by swapping two globally unique order values.
 * Every unrelated node keeps its existing order.
 *
 * @param nodes Flat Beschluss nodes.
 * @param nodeId Node to move.
 * @param direction Adjacent sibling to swap with.
 * @returns Updated nodes, or a shallow copy when the move is not possible.
 */
export const reorderSibling = (
  nodes: ReadonlyArray<BeschlussNode>,
  nodeId: string,
  direction: 'up' | 'down',
): BeschlussNode[] => {
  const siblings = siblingsOf(nodes, nodeId);
  const index = siblings.findIndex((node) => node.id === nodeId);
  if (index < 0) {
    return [...nodes];
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= siblings.length) {
    return [...nodes];
  }

  const moving = siblings[index];
  const swapped = siblings[targetIndex];
  if (!moving || !swapped) {
    return [...nodes];
  }

  return nodes.map((node) => {
    if (node.id === moving.id) {
      return { ...node, order: swapped.order };
    }

    if (node.id === swapped.id) {
      return { ...node, order: moving.order };
    }

    return node;
  });
};

export const nextNodeOrder = (nodes: ReadonlyArray<BeschlussNode>): number => {
  if (nodes.length === 0) {
    return 0;
  }

  return Math.max(...nodes.map((node) => node.order)) + 1;
};

export const catalogTopicNames = (
  topics: ReadonlyArray<{ name: string }>,
): ReadonlySet<string> => new Set(topics.map((topic) => topic.name));

export const isUnknownTopic = (
  topic: string | null,
  knownTopics: ReadonlySet<string>,
): boolean => topic !== null && knownTopics.has(topic) === false;
