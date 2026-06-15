import type { ProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import type { NodeTypeLiteral } from '@/db/nodes/types';
import { invariant } from 'es-toolkit/util';
import { getNodeTypeColor } from '../nodeTypePresentation';
import {
  collectTypeGraph,
  type EdgeCountByType,
} from './typeLevelGraph.collect';
import {
  isProjectScopedRootType,
  ROOT_TYPE,
  TOPIC_TYPE,
} from './typeLevelGraph.constants';
import {
  applyPreferredTypeDepths,
  buildDepthMap,
  buildNodePositions,
  computeNearestNodeDistance,
  VERTICAL_MARGIN,
} from './typeLevelGraph.layout';
import { sortPresentTypes } from './typeLevelGraph.sort';

export const GRAPH_ROOT_NODE_ID = 'graph-root-project';
type TypeGraphNodeId = NodeTypeLiteral | typeof GRAPH_ROOT_NODE_ID;

export type TypeLevelGraphNode = {
  color: string;
  count: number;
  degree: number;
  depth: number;
  id: TypeGraphNodeId;
  label: string;
  nearestNodeDistance: number;
  nodeType: NodeTypeLiteral | null;
  x: number;
  y: number;
};

export type TypeLevelGraphEdge = {
  count: number;
  isBackEdge: boolean;
  kind: 'forward' | 'secondary';
  source: TypeGraphNodeId;
  target: TypeGraphNodeId;
};

export type TypeLevelGraphLayout = {
  edges: TypeLevelGraphEdge[];
  height: number;
  maxNodeCount: number;
  nodes: TypeLevelGraphNode[];
  rootType: TypeGraphNodeId;
  width: number;
};

type TypeLevelGraphViewport = {
  height: number;
  width: number;
};

function buildTypeNodes(
  presentTypes: NodeTypeLiteral[],
  positions: Map<NodeTypeLiteral, { x: number; y: number }>,
  nodeCountsByType: Map<NodeTypeLiteral, number>,
  degreeByType: Map<NodeTypeLiteral, number>,
  depthByType: Map<NodeTypeLiteral, number>,
): TypeLevelGraphNode[] {
  return presentTypes.map((type) => {
    const position = positions.get(type) ?? {
      x: 180,
      y: 96,
    };

    return {
      color: getNodeTypeColor(type),
      count: nodeCountsByType.get(type) ?? 0,
      degree: degreeByType.get(type) ?? 0,
      depth: depthByType.get(type) ?? 0,
      id: type,
      label: type,
      nearestNodeDistance: computeNearestNodeDistance(type, positions),
      nodeType: type,
      x: position.x,
      y: position.y,
    } satisfies TypeLevelGraphNode;
  });
}

function buildGraphRootNode(params: {
  degree: number;
  firstContentType: NodeTypeLiteral;
  positions: Map<NodeTypeLiteral, { x: number; y: number }>;
  verticalGap: number;
  width: number;
}) {
  const { degree, firstContentType, positions, verticalGap, width } = params;
  const firstContentPosition = positions.get(firstContentType);
  const x = firstContentPosition?.x ?? width / 2;
  const y = firstContentPosition
    ? Math.max(VERTICAL_MARGIN, firstContentPosition.y - verticalGap)
    : VERTICAL_MARGIN;

  return {
    color: '#64748b',
    count: 1,
    degree,
    depth: 0,
    id: GRAPH_ROOT_NODE_ID,
    label: ROOT_TYPE,
    nearestNodeDistance: firstContentPosition
      ? Math.hypot(firstContentPosition.x - x, firstContentPosition.y - y)
      : Number.POSITIVE_INFINITY,
    nodeType: null,
    x,
    y,
  } satisfies TypeLevelGraphNode;
}

/**
 * Aggregates node-instance relationships into type-to-type edges while marking
 * edges that travel sideways or upward in the layered layout.
 */
function buildTypeEdges(
  outgoingCounts: EdgeCountByType,
  depthByType: Map<NodeTypeLiteral, number>,
  syntheticRootTargets: NodeTypeLiteral[],
  includeSyntheticRoot: boolean,
) {
  const edges: TypeLevelGraphEdge[] = includeSyntheticRoot
    ? syntheticRootTargets.map((target) => ({
        count: 1,
        isBackEdge: false,
        kind: 'secondary',
        source: GRAPH_ROOT_NODE_ID,
        target,
      }))
    : [];

  for (const [sourceType, targets] of outgoingCounts) {
    for (const [targetType, count] of targets) {
      const sourceDepth = depthByType.get(sourceType) ?? 0;
      const targetDepth = depthByType.get(targetType) ?? 0;

      edges.push({
        count,
        isBackEdge: targetDepth <= sourceDepth,
        kind: targetDepth > sourceDepth ? 'forward' : 'secondary',
        source: sourceType,
        target: targetType,
      });
    }
  }

  return edges.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'forward' ? -1 : 1;
    }

    return left.count - right.count;
  });
}

/** Builds a layered type-level view of graph node types. */
// eslint-disable-next-line custom-size/limit-logic-function-lines -- Layout construction stays easier to audit when the scoped-root branching is kept with the return shape.
export function buildTypeLevelGraphLayout(
  graph: ProjectNodeIndex,
  viewport?: TypeLevelGraphViewport,
  options: { rootNodeType?: NodeTypeLiteral } = {},
): TypeLevelGraphLayout {
  const includeSyntheticRoot = options.rootNodeType === undefined;
  const { degreeByType, incomingCounts, nodeCountsByType, outgoingCounts } =
    collectTypeGraph(graph, {
      includeProjectType: !includeSyntheticRoot,
    });
  const presentTypes = sortPresentTypes(nodeCountsByType);

  if (presentTypes.length === 0) {
    return {
      edges: [],
      height: Math.max(192, viewport?.height ?? 0),
      maxNodeCount: 0,
      nodes: [],
      rootType: GRAPH_ROOT_NODE_ID,
      width: Math.max(360, viewport?.width ?? 0),
    };
  }

  const rootType =
    options.rootNodeType && presentTypes.includes(options.rootNodeType)
      ? options.rootNodeType
      : presentTypes.includes(TOPIC_TYPE)
        ? TOPIC_TYPE
        : presentTypes[0];
  invariant(rootType !== undefined, 'Expected graph root type');
  const baseDepthByType = buildDepthMap(
    presentTypes,
    incomingCounts,
    outgoingCounts,
    rootType,
  );
  const depthByType = includeSyntheticRoot
    ? applyPreferredTypeDepths(baseDepthByType, presentTypes)
    : baseDepthByType;
  const { height, positions, verticalGap, width } = buildNodePositions(
    presentTypes,
    depthByType,
    incomingCounts,
    nodeCountsByType,
    degreeByType,
    viewport,
  );
  const firstContentType = rootType;
  const syntheticRootTargets = presentTypes.filter(isProjectScopedRootType);
  if (syntheticRootTargets.length === 0) {
    syntheticRootTargets.push(firstContentType);
  }
  const contentNodes = buildTypeNodes(
    presentTypes,
    positions,
    nodeCountsByType,
    degreeByType,
    depthByType,
  );

  if (includeSyntheticRoot) {
    contentNodes.unshift(
      buildGraphRootNode({
        degree: syntheticRootTargets.length,
        firstContentType,
        positions,
        verticalGap,
        width,
      }),
    );
  }

  return {
    edges: buildTypeEdges(
      outgoingCounts,
      depthByType,
      syntheticRootTargets,
      includeSyntheticRoot,
    ),
    height,
    maxNodeCount: Math.max(...contentNodes.map((node) => node.count), 0),
    nodes: contentNodes,
    rootType: includeSyntheticRoot ? GRAPH_ROOT_NODE_ID : rootType,
    width,
  };
}
