import {
  buildProjectNodeIndex,
  hasNode,
  type ProjectNodeIndex,
} from '@/db/nodes/projectNodeIndex';
import type { NodeSummary } from '@/db/nodes/types';

export type ProjectNodeEdge = {
  source: string;
  target: string;
};

export const buildScopedProjectNodeIndex = (
  index: ProjectNodeIndex,
  nodeIds: Iterable<string>,
) => {
  const summaries: NodeSummary[] = [];
  const seenNodeIds = new Set<string>();

  for (const nodeId of nodeIds) {
    if (seenNodeIds.has(nodeId)) {
      continue;
    }

    seenNodeIds.add(nodeId);

    const summary = index.nodeById.get(nodeId);

    if (summary) {
      summaries.push(summary);
    }
  }

  return buildProjectNodeIndex(summaries);
};

export const getNodeSummaries = (index: ProjectNodeIndex) => {
  return Array.from(index.nodeById.values());
};

export const getNodeEdges = (index: ProjectNodeIndex): ProjectNodeEdge[] => {
  const edges: ProjectNodeEdge[] = [];

  for (const [source, targetIds] of index.childrenByNodeId) {
    for (const target of targetIds) {
      edges.push({ source, target });
    }
  }

  return edges;
};

export const getNodeDegree = (index: ProjectNodeIndex, nodeId: string) => {
  if (!hasNode(index, nodeId)) {
    return 0;
  }

  return (
    (index.parentIdsByNodeId.get(nodeId)?.length ?? 0) +
    (index.childrenByNodeId.get(nodeId)?.length ?? 0)
  );
};
