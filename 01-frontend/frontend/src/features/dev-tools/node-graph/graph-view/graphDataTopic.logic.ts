import {
  hasNode,
  type ProjectNodeIndex,
} from '@/db/nodes/examinationGraphModel';
import type { NodePayloadByType } from '@/db/nodes/types';
import { buildScopedProjectNodeIndex } from '../graph-data/projectNodeGraph.logic';

export function buildTopicScopedGraph(params: {
  graph: ProjectNodeIndex;
  selectedTopic: NodePayloadByType<'topic'> | null;
  getDescendants: (nodeId: string) => { id: string }[];
}) {
  const { getDescendants, graph, selectedTopic } = params;

  if (!selectedTopic) {
    return graph;
  }

  const topicRefs = [
    { id: selectedTopic.id },
    ...getDescendants(selectedTopic.id),
  ];

  return buildScopedProjectNodeIndex(
    graph,
    topicRefs.flatMap((ref) => (hasNode(graph, ref.id) ? [ref.id] : [])),
  );
}

export function buildDescendantScopedGraph(params: {
  graph: ProjectNodeIndex;
  selectedNodeId: string;
  getDescendants: (nodeId: string) => { id: string }[];
}) {
  const { getDescendants, graph, selectedNodeId } = params;

  if (!selectedNodeId || !hasNode(graph, selectedNodeId)) {
    return buildScopedProjectNodeIndex(graph, []);
  }

  const descendantRefs = [
    { id: selectedNodeId },
    ...getDescendants(selectedNodeId),
  ];

  return buildScopedProjectNodeIndex(
    graph,
    descendantRefs.flatMap((ref) => (hasNode(graph, ref.id) ? [ref.id] : [])),
  );
}
