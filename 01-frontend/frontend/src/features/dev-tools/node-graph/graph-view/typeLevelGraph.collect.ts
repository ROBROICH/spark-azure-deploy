import {
  getChildNodes,
  type ProjectNodeIndex,
} from '@/db/nodes/examinationGraphModel';
import type { NodeTypeLiteral } from '@/db/nodes/types';
import { getNodeSummaries } from '../graph-data/projectNodeGraph.logic';
import { ROOT_TYPE } from './typeLevelGraph.constants';

export type EdgeCountByType = Map<
  NodeTypeLiteral,
  Map<NodeTypeLiteral, number>
>;

function ensureNestedCountMap(map: EdgeCountByType, type: NodeTypeLiteral) {
  const current = map.get(type);

  if (current) {
    return current;
  }

  const next = new Map<NodeTypeLiteral, number>();
  map.set(type, next);

  return next;
}

function incrementNestedCount(
  map: EdgeCountByType,
  sourceType: NodeTypeLiteral,
  targetType: NodeTypeLiteral,
) {
  const nestedMap = ensureNestedCountMap(map, sourceType);
  nestedMap.set(targetType, (nestedMap.get(targetType) ?? 0) + 1);
}

function registerTypeEdge(params: {
  includeProjectType: boolean;
  incomingCounts: EdgeCountByType;
  outgoingCounts: EdgeCountByType;
  sourceType: NodeTypeLiteral;
  targetType: NodeTypeLiteral;
}) {
  const {
    includeProjectType,
    incomingCounts,
    outgoingCounts,
    sourceType,
    targetType,
  } = params;

  if (
    sourceType === targetType ||
    (!includeProjectType && targetType === ROOT_TYPE)
  ) {
    return;
  }

  incrementNestedCount(outgoingCounts, sourceType, targetType);
  incrementNestedCount(incomingCounts, targetType, sourceType);
}

/** Collects type counts and type-to-type edge counts for the current graph mode. */
export function collectTypeGraph(
  graph: ProjectNodeIndex,
  options: { includeProjectType: boolean },
) {
  const nodeCountsByType = new Map<NodeTypeLiteral, number>();
  const outgoingCounts = new Map<
    NodeTypeLiteral,
    Map<NodeTypeLiteral, number>
  >();
  const incomingCounts = new Map<
    NodeTypeLiteral,
    Map<NodeTypeLiteral, number>
  >();
  const degreeByType = new Map<NodeTypeLiteral, number>();

  for (const attributes of getNodeSummaries(graph)) {
    if (!options.includeProjectType && attributes.nodeType === ROOT_TYPE) {
      continue;
    }

    nodeCountsByType.set(
      attributes.nodeType,
      (nodeCountsByType.get(attributes.nodeType) ?? 0) + 1,
    );
  }

  for (const attributes of getNodeSummaries(graph)) {
    const sourceType = attributes.nodeType;

    if (!options.includeProjectType && sourceType === ROOT_TYPE) {
      continue;
    }

    for (const child of getChildNodes(graph, attributes.id)) {
      registerTypeEdge({
        includeProjectType: options.includeProjectType,
        incomingCounts,
        outgoingCounts,
        sourceType,
        targetType: child.nodeType,
      });
    }
  }

  for (const type of nodeCountsByType.keys()) {
    const incomingDegree = Array.from(
      incomingCounts.get(type)?.values() ?? [],
    ).reduce((sum, value) => sum + value, 0);
    const outgoingDegree = Array.from(
      outgoingCounts.get(type)?.values() ?? [],
    ).reduce((sum, value) => sum + value, 0);

    degreeByType.set(type, incomingDegree + outgoingDegree);
  }

  return {
    degreeByType,
    incomingCounts,
    nodeCountsByType,
    outgoingCounts,
  };
}
