import type { NodeSummary, NodeTypeLiteral } from '@/db/nodes/types';
import type { ProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import {
  getNodeDegree,
  getNodeEdges,
  getNodeSummaries,
} from '../graph-data/projectNodeGraph.logic';
import type { ZoomTransform } from 'd3';
import { zoomIdentity } from 'd3';
import { getNodeTypeColor, nodeTypeLabels } from '../nodeTypePresentation';
import type {
  GraphDataRenderNode,
  GraphDataScene,
} from './graphDataScene.logic';
import type {
  TypeLevelGraphLayout,
  TypeLevelGraphNode,
} from './typeLevelGraph.logic';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MIN_INTERACTIVE_NODE_ALPHA = 0.12;
const MIN_HIT_RADIUS_PX = 12;

type Point = {
  x: number;
  y: number;
};

export type GraphDataActualNode = {
  color: string;
  degree: number;
  id: string;
  label: string;
  nodeType: NodeTypeLiteral;
  radius: number;
  x: number;
  y: number;
};

export type GraphDataActualEdge = {
  source: string;
  sourceType: NodeTypeLiteral;
  target: string;
  targetType: NodeTypeLiteral;
};

export type GraphDataLayout = {
  actualEdges: GraphDataActualEdge[];
  actualNodes: GraphDataActualNode[];
  actualNodesById: Map<string, GraphDataActualNode>;
  height: number;
  maxActualNodeDegree: number;
  typeLayout: TypeLevelGraphLayout;
  typeNodesByType: Map<NodeTypeLiteral, TypeLevelGraphNode>;
  width: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getClusterRadius(count: number) {
  return clamp(Math.sqrt(count) * 12, 44, 260);
}

function getSpiralPoint(index: number, count: number, center: Point): Point {
  if (count === 1) {
    return center;
  }

  const angle = index * GOLDEN_ANGLE;
  const radius = Math.sqrt(index + 0.5) * 9.5;
  const maxRadius = getClusterRadius(count);
  const clampedRadius = Math.min(radius, maxRadius);

  return {
    x: center.x + Math.cos(angle) * clampedRadius,
    y: center.y + Math.sin(angle) * clampedRadius * 0.72,
  };
}

function getActualNodeRadius(degree: number) {
  return clamp(Math.sqrt(degree + 1) * 1.75, 3.6, 8.5);
}

function getActualNodeLabel(node: NodeSummary) {
  return `${nodeTypeLabels[node.nodeType]} ${node.id.slice(0, 8)}`;
}

function sortNodeSummaries(left: NodeSummary, right: NodeSummary) {
  return left.id.localeCompare(right.id, 'de', {
    numeric: true,
    sensitivity: 'base',
  });
}

function buildTypeNodeLookup(typeLayout: TypeLevelGraphLayout) {
  const typeNodesByType = new Map<NodeTypeLiteral, TypeLevelGraphNode>();

  for (const node of typeLayout.nodes) {
    if (node.nodeType === null) {
      continue;
    }

    typeNodesByType.set(node.nodeType, node);
  }

  return typeNodesByType;
}

function groupActualNodesByType(
  graph: ProjectNodeIndex,
  typeNodesByType: Map<NodeTypeLiteral, TypeLevelGraphNode>,
) {
  const groupedNodes = new Map<NodeTypeLiteral, NodeSummary[]>();

  for (const attributes of getNodeSummaries(graph)) {
    if (!typeNodesByType.has(attributes.nodeType)) {
      continue;
    }

    const nodesOfType = groupedNodes.get(attributes.nodeType);

    if (nodesOfType) {
      nodesOfType.push(attributes);
      continue;
    }

    groupedNodes.set(attributes.nodeType, [attributes]);
  }

  for (const nodes of groupedNodes.values()) {
    nodes.sort(sortNodeSummaries);
  }

  return groupedNodes;
}

/**
 * Projects every real graph node into a stable packed cluster around its
 * type-level anchor so zoom can morph one prototype into real node instances
 * without running a large force simulation in the render path.
 */
export function buildGraphDataLayout(
  graph: ProjectNodeIndex,
  typeLayout: TypeLevelGraphLayout,
): GraphDataLayout {
  const typeNodesByType = buildTypeNodeLookup(typeLayout);
  const groupedNodes = groupActualNodesByType(graph, typeNodesByType);
  const actualNodes: GraphDataActualNode[] = [];
  const actualNodesById = new Map<string, GraphDataActualNode>();
  let maxActualNodeDegree = 0;

  for (const [type, nodes] of groupedNodes) {
    const typeNode = typeNodesByType.get(type);

    if (!typeNode) {
      continue;
    }

    nodes.forEach((node, index) => {
      const point = getSpiralPoint(index, nodes.length, typeNode);
      const degree = getNodeDegree(graph, node.id);
      const actualNode = {
        color: getNodeTypeColor(node.nodeType),
        degree,
        id: node.id,
        label: getActualNodeLabel(node),
        nodeType: node.nodeType,
        radius: getActualNodeRadius(degree),
        x: point.x,
        y: point.y,
      } satisfies GraphDataActualNode;

      actualNodes.push(actualNode);
      actualNodesById.set(actualNode.id, actualNode);
      maxActualNodeDegree = Math.max(maxActualNodeDegree, degree);
    });
  }

  const actualEdges: GraphDataActualEdge[] = [];
  for (const { source, target } of getNodeEdges(graph)) {
    const sourceNode = actualNodesById.get(source);
    const targetNode = actualNodesById.get(target);

    if (!sourceNode || !targetNode) {
      continue;
    }

    actualEdges.push({
      source,
      sourceType: sourceNode.nodeType,
      target,
      targetType: targetNode.nodeType,
    });
  }

  return {
    actualEdges,
    actualNodes,
    actualNodesById,
    height: typeLayout.height,
    maxActualNodeDegree,
    typeLayout,
    typeNodesByType,
    width: typeLayout.width,
  };
}

export function getGraphDataFitTransform(params: {
  height: number;
  viewport: { height: number; width: number };
  width: number;
}) {
  const { height, viewport, width } = params;

  if (viewport.height === 0 || viewport.width === 0 || height === 0) {
    return zoomIdentity;
  }

  const padding = 48;
  const scale = Math.min(
    (viewport.width - padding * 2) / width,
    (viewport.height - padding * 2) / height,
  );
  const safeScale = Math.max(scale, 0.1);
  const x = (viewport.width - width * safeScale) / 2;
  const y = (viewport.height - height * safeScale) / 2;

  return zoomIdentity.translate(x, y).scale(safeScale);
}

export function findNearestGraphDataNode(params: {
  point: Point;
  scene: GraphDataScene;
  transform: ZoomTransform;
}) {
  const { point, scene, transform } = params;
  let nearestNode: GraphDataRenderNode | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const node of scene.actualNodes) {
    if (node.alpha < MIN_INTERACTIVE_NODE_ALPHA) {
      continue;
    }

    const screenX = transform.applyX(node.displayX);
    const screenY = transform.applyY(node.displayY);
    const hitRadius = Math.max(
      MIN_HIT_RADIUS_PX,
      node.displayRadius * transform.k + 7,
    );
    const distance = Math.hypot(screenX - point.x, screenY - point.y);

    if (distance > hitRadius || distance >= nearestDistance) {
      continue;
    }

    nearestNode = node;
    nearestDistance = distance;
  }

  return nearestNode;
}
