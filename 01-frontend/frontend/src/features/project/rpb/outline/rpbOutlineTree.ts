import type { NodePayloadByType } from '@/db/nodes/types';
import { invariant } from 'es-toolkit/util';

export type RpbOutlineStructuralNode = Pick<
  NodePayloadByType<'vae_node'>,
  | 'checkedByAssignee'
  | 'checkedByLeader'
  | 'id'
  | 'isDeleted'
  | 'isHidden'
  | 'order'
  | 'parentVaeNodeId'
  | 'title'
> & {
  topicId?: string | null;
};

export type RpbOutlineTreeNode<
  TNode extends RpbOutlineStructuralNode = RpbOutlineStructuralNode,
> = {
  vaeNode: TNode;
  children: RpbOutlineTreeNode<TNode>[];
};

export type RpbFlatOutlineNode = {
  vaeNode: RpbOutlineStructuralNode;
  depth: number;
  index: number;
};

const compareOutlineNodes = (
  left: RpbOutlineStructuralNode,
  right: RpbOutlineStructuralNode,
) => {
  if (left.order !== right.order) {
    return left.order - right.order;
  }

  return left.id.localeCompare(right.id);
};

const isRenderableOutlineNode = (vaeNode: RpbOutlineStructuralNode) => {
  return !vaeNode.isDeleted && !vaeNode.isHidden;
};

/**
 * Builds the synthetic outline tree required by the UI from flat `vae_node`
 * payloads that reference their parent through `parent_vae_node_id`.
 */
export const buildRpbOutlineTree = <TNode extends RpbOutlineStructuralNode>(
  vaeNodes: TNode[],
): RpbOutlineTreeNode<TNode>[] => {
  const renderableNodes = vaeNodes
    .filter(isRenderableOutlineNode)
    .sort(compareOutlineNodes);
  const treeNodesById = new Map<string, RpbOutlineTreeNode<TNode>>(
    renderableNodes.map((vaeNode) => [
      vaeNode.id,
      {
        vaeNode,
        children: [],
      } satisfies RpbOutlineTreeNode<TNode>,
    ]),
  );
  const roots: RpbOutlineTreeNode<TNode>[] = [];

  for (const vaeNode of renderableNodes) {
    const treeNode = treeNodesById.get(vaeNode.id);
    if (!treeNode) {
      continue;
    }

    const parentId = vaeNode.parentVaeNodeId;
    if (!parentId || parentId === vaeNode.id) {
      roots.push(treeNode);
      continue;
    }

    const parentNode = treeNodesById.get(parentId);
    if (!parentNode) {
      roots.push(treeNode);
      continue;
    }

    parentNode.children.push(treeNode);
  }

  return roots;
};

/**
 * Recursively flattens outline node ids up to a maximum render depth so route
 * selection can normalize deeper ids back to the nearest supported ancestor.
 */
export const flattenRpbOutlineNodeIds = (
  nodes: RpbOutlineTreeNode[],
  maxDepth = Number.POSITIVE_INFINITY,
  depth = 0,
): string[] => {
  return nodes.flatMap((node) => {
    const childIds =
      depth < maxDepth
        ? flattenRpbOutlineNodeIds(node.children, maxDepth, depth + 1)
        : [];

    return [node.vaeNode.id, ...childIds];
  });
};

export const flattenRpbOutlineTree = (
  nodes: RpbOutlineTreeNode[],
  depth = 0,
): RpbFlatOutlineNode[] => {
  return nodes.flatMap((node, index) => [
    {
      vaeNode: node.vaeNode,
      depth,
      index,
    },
    ...flattenRpbOutlineTree(node.children, depth + 1),
  ]);
};

export const readRelevantCheckedField = (
  vaeNode: RpbOutlineStructuralNode,
  canApproveFinalDecision: boolean,
) => {
  return canApproveFinalDecision
    ? vaeNode.checkedByLeader
    : vaeNode.checkedByAssignee;
};

/** Builds a checked-state map for either completion or final-decision approval. */
export const createRpbOutlineCheckedStateById = (
  nodes: RpbOutlineTreeNode[],
  canApproveFinalDecision: boolean,
) => {
  const checkedStateById = new Map<string, boolean>();

  /**
   * Recurses through the outline tree so nested descendants inherit the same
   * role-specific checked-state calculation as top-level nodes.
   */
  const visit = (node: RpbOutlineTreeNode) => {
    checkedStateById.set(
      node.vaeNode.id,
      readRelevantCheckedField(node.vaeNode, canApproveFinalDecision),
    );

    for (const child of node.children) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return checkedStateById;
};

export const areAllTopLevelRpbOutlineNodesChecked = (
  nodes: RpbOutlineTreeNode[],
  canApproveFinalDecision: boolean,
  checkedStateById = createRpbOutlineCheckedStateById(
    nodes,
    canApproveFinalDecision,
  ),
) => {
  return (
    nodes.length > 0 &&
    nodes.every((node) => checkedStateById.get(node.vaeNode.id) === true)
  );
};

/**
 * Recursively finds one outline tree node by VAE node id.
 */
export const findRpbOutlineNodeById = (
  nodes: RpbOutlineTreeNode[],
  targetId: string,
): RpbOutlineTreeNode | null => {
  for (const node of nodes) {
    if (node.vaeNode.id === targetId) {
      return node;
    }

    const matchingChild = findRpbOutlineNodeById(node.children, targetId);
    if (matchingChild) {
      return matchingChild;
    }
  }

  return null;
};

/**
 * Recursively finds the outline node lineage from root to one target node.
 */
export const findRpbOutlineNodeLineage = (
  nodes: RpbOutlineTreeNode[],
  targetId: string,
): RpbOutlineTreeNode[] => {
  for (const node of nodes) {
    if (node.vaeNode.id === targetId) {
      return [node];
    }

    const childLineage = findRpbOutlineNodeLineage(node.children, targetId);
    if (childLineage.length > 0) {
      return [node, ...childLineage];
    }
  }

  return [];
};

export const findRpbOutlineEffectiveTopicId = (
  nodes: RpbOutlineTreeNode[],
  targetId: string,
): string | undefined => {
  const lineage = findRpbOutlineNodeLineage(nodes, targetId);

  for (let i = lineage.length - 1; i >= 0; i -= 1) {
    const lineageNode = lineage[i];
    invariant(lineageNode !== undefined, 'Expected outline lineage node');
    const topicId = lineageNode.vaeNode.topicId;
    if (topicId) {
      return topicId;
    }
  }

  return undefined;
};

/**
 * Resolves the mutation permission topic for an outline node by walking the
 * full flat `vae_node` parent chain, including nodes that are not renderable in
 * the outline tree. Returns `null` for intentional project-level no-topic
 * nodes and `undefined` for broken parent chains.
 */
export const resolveRpbOutlineMutationTopicId = (
  nodes: RpbOutlineStructuralNode[],
  targetId: string,
): string | null | undefined => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const seenNodeIds = new Set<string>();
  let currentNodeId: string | null | undefined = targetId;

  while (currentNodeId) {
    if (seenNodeIds.has(currentNodeId)) {
      return undefined;
    }

    seenNodeIds.add(currentNodeId);

    const node = nodesById.get(currentNodeId);
    if (!node) {
      return undefined;
    }

    if (node.topicId) {
      return node.topicId;
    }

    currentNodeId = node.parentVaeNodeId;
  }

  return null;
};

/**
 * Finds the ancestor path for one outline node id inside the tree, excluding
 * the target node itself.
 */
export const findRpbOutlineAncestorIds = (
  nodes: RpbOutlineTreeNode[],
  targetId: string,
): string[] => {
  return findRpbOutlineNodeLineage(nodes, targetId)
    .slice(0, -1)
    .map((node) => node.vaeNode.id);
};

export const normalizeRpbOutlineNodeId = (
  nodeId: string | undefined,
  selectableOutlineNodeIdSet: Set<string>,
  defaultOutlineNodeId: string,
  outlineTree: RpbOutlineTreeNode[],
) => {
  if (!nodeId) {
    return defaultOutlineNodeId;
  }

  if (selectableOutlineNodeIdSet.has(nodeId)) {
    return nodeId;
  }

  const ancestorIds = findRpbOutlineAncestorIds(outlineTree, nodeId);
  for (let i = ancestorIds.length - 1; i >= 0; i -= 1) {
    const ancestorId = ancestorIds[i];
    if (!ancestorId) {
      continue;
    }

    if (selectableOutlineNodeIdSet.has(ancestorId)) {
      return ancestorId;
    }
  }

  return defaultOutlineNodeId;
};
