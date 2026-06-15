import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
  type ZoomTransform,
} from 'd3';
import { startTransition } from 'react';
import type {
  TypeLevelGraphEdge,
  TypeLevelGraphNode,
} from './typeLevelGraph.logic';
import { GRAPH_ROOT_NODE_ID } from './typeLevelGraph.logic';

export type AnimatedTypeNode = TypeLevelGraphNode &
  SimulationNodeDatum & {
    targetX: number;
    targetY: number;
    wiggleAmplitude: number;
    wigglePhase: number;
  };

export type AnimatedTypeEdge = SimulationLinkDatum<AnimatedTypeNode> &
  TypeLevelGraphEdge & {
    strength: number;
  };

type LabelAnchor = 'end' | 'middle' | 'start';

export type VisibleNodeLabel = {
  anchor: LabelAnchor;
  metaY: number;
  textX: number;
  textY: number;
};

type LabelBounds = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

function estimateLabelWidth(node: TypeLevelGraphNode) {
  return Math.max(node.label.length * 7.2, 52);
}

function getLabelAwareSpacingRadius(
  node: TypeLevelGraphNode,
  nodeRadiusScale: (count: number) => number,
) {
  const nodeRadius = nodeRadiusScale(node.count);

  return Math.max(nodeRadius + 18, estimateLabelWidth(node) / 2 + 18);
}

export function getEdgeStrokeWidth(count: number) {
  if (count >= 24) {
    return 2.2;
  }

  if (count >= 12) {
    return 1.8;
  }

  if (count >= 6) {
    return 1.5;
  }

  return 1.1;
}

function shouldShowNodeLabel(
  nearestNodeDistance: number,
  nodeId: string,
  zoomTransform: ZoomTransform,
) {
  if (nodeId === GRAPH_ROOT_NODE_ID || nodeId === 'topic') {
    return true;
  }

  if (zoomTransform.k >= 1.75) {
    return true;
  }

  return nearestNodeDistance * zoomTransform.k >= 230;
}

function createAnimatedNodes(
  nodes: TypeLevelGraphNode[],
  nodeRadiusScale: (count: number) => number,
) {
  return nodes.map((node, index) => ({
    ...node,
    targetX: node.x,
    targetY: node.y,
    wiggleAmplitude:
      node.id === GRAPH_ROOT_NODE_ID
        ? 0
        : Math.max(
            6,
            Math.min(
              18,
              node.nearestNodeDistance / 14 - nodeRadiusScale(node.count) / 4,
            ),
          ),
    wigglePhase: (index + 1) * 0.9,
    x: node.x,
    y: node.y,
  }));
}

function createAnimatedEdges(edges: TypeLevelGraphEdge[]): AnimatedTypeEdge[] {
  return edges.map((edge) => ({
    ...edge,
    source: edge.source,
    strength: edge.kind === 'forward' ? 0.3 : 0.14,
    target: edge.target,
  }));
}

function estimateLabelBounds(
  node: TypeLevelGraphNode,
  placement: VisibleNodeLabel,
  showMeta: boolean,
) {
  const labelWidth = estimateLabelWidth(node);
  const width =
    placement.anchor === 'middle' ? labelWidth : Math.max(labelWidth + 8, 72);
  const height = showMeta ? 36 : 18;
  const left =
    placement.anchor === 'middle'
      ? node.x + placement.textX - width / 2
      : placement.anchor === 'start'
        ? node.x + placement.textX
        : node.x + placement.textX - width;

  return {
    bottom: node.y + placement.textY + height,
    left,
    right: left + width,
    top: node.y + placement.textY - 14,
  } satisfies LabelBounds;
}

function labelsOverlap(left: LabelBounds, right: LabelBounds) {
  return !(
    left.right < right.left ||
    left.left > right.right ||
    left.bottom < right.top ||
    left.top > right.bottom
  );
}

function createDefaultLabelPlacement(radius: number): VisibleNodeLabel {
  return {
    anchor: 'middle',
    metaY: radius + 42,
    textX: 0,
    textY: radius + 24,
  };
}

/**
 * Keeps label placement stable and only suppresses labels that collide with
 * already accepted labels.
 */
export function buildVisibleNodeLabels(
  nodes: TypeLevelGraphNode[],
  nodeRadiusScale: (count: number) => number,
  zoomTransform: ZoomTransform,
) {
  const sortedNodes = [...nodes].sort((left, right) => {
    if (left.id === GRAPH_ROOT_NODE_ID && right.id !== GRAPH_ROOT_NODE_ID) {
      return -1;
    }

    if (right.id === GRAPH_ROOT_NODE_ID && left.id !== GRAPH_ROOT_NODE_ID) {
      return 1;
    }

    if (left.id === 'topic' && right.id !== 'topic') {
      return -1;
    }

    if (right.id === 'topic' && left.id !== 'topic') {
      return 1;
    }

    return right.degree - left.degree || right.count - left.count;
  });
  const occupiedBounds: LabelBounds[] = [];
  const visibleLabels = new Map<string, VisibleNodeLabel>();

  for (const node of sortedNodes) {
    if (
      !shouldShowNodeLabel(node.nearestNodeDistance, node.id, zoomTransform)
    ) {
      continue;
    }

    const radius = nodeRadiusScale(node.count);
    const showMeta = zoomTransform.k >= 1.2 || node.id === GRAPH_ROOT_NODE_ID;
    const placement = createDefaultLabelPlacement(radius);
    const candidateBounds = estimateLabelBounds(node, placement, showMeta);

    if (
      occupiedBounds.some((bounds) => labelsOverlap(bounds, candidateBounds))
    ) {
      continue;
    }

    occupiedBounds.push(candidateBounds);
    visibleLabels.set(node.id, placement);
  }

  return visibleLabels;
}

function getLinkDistance(
  edge: AnimatedTypeEdge,
  nodeRadiusScale: (count: number) => number,
) {
  const sourceNode = edge.source as AnimatedTypeNode;
  const targetNode = edge.target as AnimatedTypeNode;
  const sourceSpacing = getLabelAwareSpacingRadius(sourceNode, nodeRadiusScale);
  const targetSpacing = getLabelAwareSpacingRadius(targetNode, nodeRadiusScale);
  const baseDistance = edge.kind === 'forward' ? 150 : 210;

  return baseDistance + sourceSpacing * 0.25 + targetSpacing * 0.25;
}

function getChargeStrength(
  node: AnimatedTypeNode,
  nodeRadiusScale: (count: number) => number,
) {
  return -40 - getLabelAwareSpacingRadius(node, nodeRadiusScale) * 0.75;
}

function scheduleNodeUpdate(
  animatedNodes: AnimatedTypeNode[],
  setRenderNodes: (nodes: TypeLevelGraphNode[]) => void,
  frameIdRef: { current: number },
) {
  if (frameIdRef.current !== 0) {
    return;
  }

  frameIdRef.current = window.requestAnimationFrame(() => {
    frameIdRef.current = 0;

    startTransition(() => {
      setRenderNodes(
        animatedNodes.map((node) => ({
          ...node,
          x: node.x,
          y: node.y,
        })),
      );
    });
  });
}

export function createTypeGraphSimulation(params: {
  edges: TypeLevelGraphEdge[];
  nodeRadiusScale: (count: number) => number;
  nodes: TypeLevelGraphNode[];
  setRenderNodes: (nodes: TypeLevelGraphNode[]) => void;
}) {
  const { edges, nodeRadiusScale, nodes, setRenderNodes } = params;
  const animatedNodes = createAnimatedNodes(nodes, nodeRadiusScale);
  const animatedEdges = createAnimatedEdges(edges);
  const frameIdRef = { current: 0 };
  let tickCount = 0;

  const simulation = forceSimulation(animatedNodes)
    .alpha(0.55)
    .alphaDecay(0.028)
    .alphaTarget(0.02)
    .velocityDecay(0.42)
    .force(
      'link',
      forceLink<AnimatedTypeNode, AnimatedTypeEdge>(animatedEdges)
        .id((node) => node.id)
        .distance((edge) => getLinkDistance(edge, nodeRadiusScale))
        .strength((edge) => edge.strength),
    )
    .force(
      'charge',
      forceManyBody<AnimatedTypeNode>().strength((node) =>
        getChargeStrength(node, nodeRadiusScale),
      ),
    )
    .force(
      'collide',
      forceCollide<AnimatedTypeNode>().radius((node) =>
        getLabelAwareSpacingRadius(node, nodeRadiusScale),
      ),
    )
    .force(
      'x',
      forceX<AnimatedTypeNode>((node) => {
        return (
          node.targetX +
          Math.sin(tickCount / 22 + node.wigglePhase) * node.wiggleAmplitude
        );
      }).strength(0.16),
    )
    .force(
      'y',
      forceY<AnimatedTypeNode>((node) => {
        return (
          node.targetY +
          Math.cos(tickCount / 28 + node.wigglePhase) *
            Math.min(node.wiggleAmplitude, 8)
        );
      }).strength(0.34),
    )
    .on('tick', () => {
      tickCount += 1;
      scheduleNodeUpdate(animatedNodes, setRenderNodes, frameIdRef);
    });

  return {
    cleanup: () => {
      simulation.stop();

      if (frameIdRef.current !== 0) {
        window.cancelAnimationFrame(frameIdRef.current);
      }
    },
  };
}
