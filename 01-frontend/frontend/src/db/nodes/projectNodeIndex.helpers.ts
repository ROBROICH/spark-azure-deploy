import { fromCompositeKey } from './compositeKey';
import type { NodeRef, NodeSummary, NodeTypeLiteral } from './types';

export type ProjectNodeIndexCollections = {
  childrenByNodeId: Map<string, string[]>;
  nodeById: Map<string, NodeSummary>;
  nodeCountsByType: Map<NodeTypeLiteral, number>;
  nodesByType: Map<NodeTypeLiteral, NodeSummary[]>;
  parentIdsByNodeId: Map<string, string[]>;
};

export const createProjectNodeIndexCollections =
  (): ProjectNodeIndexCollections => ({
    childrenByNodeId: new Map<string, string[]>(),
    nodeById: new Map<string, NodeSummary>(),
    nodeCountsByType: new Map<NodeTypeLiteral, number>(),
    nodesByType: new Map<NodeTypeLiteral, NodeSummary[]>(),
    parentIdsByNodeId: new Map<string, string[]>(),
  });

const getParentRefs = (summary: NodeSummary): NodeRef[] => {
  return [
    ...summary.parents,
    ...(summary.frontend_parent_ids ?? []).map(fromCompositeKey),
  ];
};

export const registerProjectNodeSummary = (
  collections: ProjectNodeIndexCollections,
  summary: NodeSummary,
) => {
  if (collections.nodeById.has(summary.id)) {
    return false;
  }

  collections.nodeById.set(summary.id, summary);
  collections.childrenByNodeId.set(summary.id, []);
  collections.parentIdsByNodeId.set(summary.id, []);

  const nodesForType = collections.nodesByType.get(summary.node_type) ?? [];
  nodesForType.push(summary);
  collections.nodesByType.set(summary.node_type, nodesForType);

  collections.nodeCountsByType.set(
    summary.node_type,
    (collections.nodeCountsByType.get(summary.node_type) ?? 0) + 1,
  );

  return true;
};

export const connectProjectNodeEdge = (
  collections: ProjectNodeIndexCollections,
  edgeSetByParent: Map<string, Set<string>>,
  parentId: string,
  childId: string,
) => {
  let childIds = edgeSetByParent.get(parentId);

  if (!childIds) {
    childIds = new Set<string>();
    edgeSetByParent.set(parentId, childIds);
  }

  if (childIds.has(childId)) {
    return false;
  }

  childIds.add(childId);
  collections.childrenByNodeId.get(parentId)?.push(childId);
  collections.parentIdsByNodeId.get(childId)?.push(parentId);

  return true;
};

export const collectProjectRootNodeIds = (
  nodeIds: Iterable<string>,
  parentIdsByNodeId: Map<string, string[]>,
) => {
  const rootNodeIds: string[] = [];

  for (const nodeId of nodeIds) {
    if ((parentIdsByNodeId.get(nodeId)?.length ?? 0) === 0) {
      rootNodeIds.push(nodeId);
    }
  }

  return rootNodeIds;
};

const connectProjectNodeEdgeIfPresent = (
  collections: ProjectNodeIndexCollections,
  edgeSetByParent: Map<string, Set<string>>,
  parentId: string,
  childId: string,
) => {
  if (!collections.nodeById.has(parentId)) {
    return 0;
  }

  return connectProjectNodeEdge(collections, edgeSetByParent, parentId, childId)
    ? 1
    : 0;
};

export const countProjectNodeEdgesForSummary = (
  collections: ProjectNodeIndexCollections,
  edgeSetByParent: Map<string, Set<string>>,
  summary: NodeSummary,
) => {
  let edgeCount = 0;

  for (const parent of getParentRefs(summary)) {
    edgeCount += connectProjectNodeEdgeIfPresent(
      collections,
      edgeSetByParent,
      parent.id,
      summary.id,
    );
  }

  return edgeCount;
};
