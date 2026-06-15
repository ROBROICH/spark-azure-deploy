import { zoomIdentity, type ZoomTransform } from 'd3';
import type {
  GraphDataPrototypeRenderNode,
  GraphDataRenderNode,
  GraphDataScene,
} from './graphDataScene.logic';
import {
  GRAPH_ROOT_NODE_ID,
  type TypeLevelGraphLayout,
  type TypeLevelGraphNode,
} from './typeLevelGraph.logic';
import { buildVisibleNodeLabels } from './typeLevelGraphView.logic';

const BACK_EDGE_PULL = 56;
const HOVER_STROKE = '#155e75';

function createForwardPath(
  context: CanvasRenderingContext2D,
  sourcePoint: { x: number; y: number },
  targetPoint: { x: number; y: number },
) {
  const controlY = sourcePoint.y + (targetPoint.y - sourcePoint.y) / 2;
  const horizontalPull = (targetPoint.x - sourcePoint.x) * 0.18;

  context.moveTo(sourcePoint.x, sourcePoint.y);
  context.bezierCurveTo(
    sourcePoint.x + horizontalPull,
    controlY,
    targetPoint.x - horizontalPull,
    controlY,
    targetPoint.x,
    targetPoint.y,
  );
}

function drawTypeEdge(params: {
  context: CanvasRenderingContext2D;
  edge: TypeLevelGraphLayout['edges'][number];
  nodeById: Map<string, TypeLevelGraphNode>;
  nodeRadiusScale: (count: number) => number;
}) {
  const { context, edge, nodeById, nodeRadiusScale } = params;
  const sourceNode = nodeById.get(edge.source);
  const targetNode = nodeById.get(edge.target);

  if (!sourceNode || !targetNode) {
    return;
  }

  const sourceRadius = nodeRadiusScale(sourceNode.count);
  const targetRadius = nodeRadiusScale(targetNode.count);
  const sourcePoint = {
    x: sourceNode.x,
    y: sourceNode.y + sourceRadius,
  };
  const targetPoint = {
    x: targetNode.x,
    y: targetNode.y - targetRadius,
  };

  if (edge.isBackEdge) {
    context.moveTo(sourcePoint.x, sourcePoint.y);
    context.bezierCurveTo(
      sourcePoint.x + BACK_EDGE_PULL,
      sourcePoint.y + 18,
      targetPoint.x + BACK_EDGE_PULL,
      targetPoint.y - 18,
      targetPoint.x,
      targetPoint.y,
    );
    return;
  }

  createForwardPath(context, sourcePoint, targetPoint);
}

function drawCircle(params: {
  context: CanvasRenderingContext2D;
  fillStyle: string;
  radius: number;
  strokeStyle?: string;
  strokeWidth?: number;
  x: number;
  y: number;
}) {
  const {
    context,
    fillStyle,
    radius,
    strokeStyle,
    strokeWidth = 0,
    x,
    y,
  } = params;

  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = fillStyle;
  context.fill();

  if (strokeStyle && strokeWidth > 0) {
    context.strokeStyle = strokeStyle;
    context.lineWidth = strokeWidth;
    context.stroke();
  }
}

export function drawPrototypeNodes(params: {
  context: CanvasRenderingContext2D;
  nodeRadiusScale: (count: number) => number;
  prototypeNodes: GraphDataPrototypeRenderNode[];
}) {
  const { context, nodeRadiusScale, prototypeNodes } = params;

  for (const node of prototypeNodes) {
    const radius = nodeRadiusScale(node.count);
    const prototypeAlpha =
      node.id === GRAPH_ROOT_NODE_ID ? 1 : Math.max(0.08, 1 - node.reveal);

    context.globalAlpha = prototypeAlpha;
    drawCircle({
      context,
      fillStyle: node.color,
      radius,
      strokeStyle: 'white',
      strokeWidth: 3,
      x: node.x,
      y: node.y,
    });

    context.globalAlpha = prototypeAlpha * 0.24;
    drawCircle({
      context,
      fillStyle: 'transparent',
      radius: radius + 6,
      strokeStyle: node.color,
      strokeWidth: 2,
      x: node.x,
      y: node.y,
    });

    if (node.reveal < 0.9 || node.id === GRAPH_ROOT_NODE_ID) {
      context.globalAlpha = prototypeAlpha;
      context.fillStyle = 'white';
      context.font = `700 ${Math.max(11, radius / 2)}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(node.count), node.x, node.y + 1);
    }
  }
}

export function drawActualEdges(params: {
  context: CanvasRenderingContext2D;
  hoveredNodeId: string | null;
  scene: GraphDataScene;
  transform: ZoomTransform;
}) {
  const { context, hoveredNodeId, scene, transform } = params;

  if (scene.actualEdges.length === 0) {
    return;
  }

  for (const edge of scene.actualEdges) {
    const isConnectedToHoveredNode =
      hoveredNodeId !== null &&
      (edge.source.id === hoveredNodeId || edge.target.id === hoveredNodeId);

    context.beginPath();
    context.globalAlpha = isConnectedToHoveredNode
      ? Math.max(edge.alpha, 0.92)
      : edge.alpha;
    context.strokeStyle = isConnectedToHoveredNode ? HOVER_STROKE : '#155e75';
    context.lineWidth = isConnectedToHoveredNode
      ? Math.max(2 / transform.k, 0.35)
      : Math.max(0.6 / transform.k, 0.12);
    context.moveTo(edge.source.displayX, edge.source.displayY);
    context.lineTo(edge.target.displayX, edge.target.displayY);
    context.stroke();
  }
}

export function drawActualNode(params: {
  connectedNodeIds: Set<string>;
  context: CanvasRenderingContext2D;
  hoveredNodeId: string | null;
  node: GraphDataRenderNode;
  transform: ZoomTransform;
}) {
  const { connectedNodeIds, context, hoveredNodeId, node, transform } = params;
  const isHovered = hoveredNodeId === node.id;
  const isConnected = connectedNodeIds.has(node.id);

  context.globalAlpha = node.alpha;
  drawCircle({
    context,
    fillStyle: node.color,
    radius: node.displayRadius,
    strokeStyle: isHovered || isConnected ? HOVER_STROKE : 'white',
    strokeWidth:
      isHovered || isConnected ? Math.max(2.4 / transform.k, 0.6) : 1.4,
    x: node.displayX,
    y: node.displayY,
  });

  if (!isHovered && !isConnected) {
    return;
  }

  context.globalAlpha = 0.18;
  drawCircle({
    context,
    fillStyle: 'transparent',
    radius: node.displayRadius + 7 / transform.k,
    strokeStyle: HOVER_STROKE,
    strokeWidth: Math.max(4 / transform.k, 0.8),
    x: node.displayX,
    y: node.displayY,
  });
}

function toCanvasTextAlign(anchor: 'end' | 'middle' | 'start') {
  return anchor === 'middle' ? 'center' : anchor;
}

export function drawTypeLabels(params: {
  context: CanvasRenderingContext2D;
  nodeRadiusScale: (count: number) => number;
  relativeZoom: number;
  scene: GraphDataScene;
}) {
  const { context, nodeRadiusScale, relativeZoom, scene } = params;
  const visibleLabels = buildVisibleNodeLabels(
    scene.prototypeNodes,
    nodeRadiusScale,
    zoomIdentity.scale(relativeZoom),
  );

  for (const node of scene.prototypeNodes) {
    const label = visibleLabels.get(node.id);

    if (!label || (node.reveal > 0.86 && node.id !== GRAPH_ROOT_NODE_ID)) {
      continue;
    }

    context.globalAlpha =
      node.id === GRAPH_ROOT_NODE_ID ? 0.9 : Math.max(0.22, 1 - node.reveal);
    context.textAlign = toCanvasTextAlign(label.anchor);
    context.fillStyle = '#0f172a';
    context.font = '700 14px sans-serif';
    context.fillText(node.label, node.x + label.textX, node.y + label.textY);
    context.fillStyle = '#64748b';
    context.font = '11px sans-serif';
    context.fillText(
      `${node.degree} edges`,
      node.x + label.textX,
      node.y + label.metaY,
    );
  }
}

export function drawTypeEdges(params: {
  context: CanvasRenderingContext2D;
  nodeById: Map<string, TypeLevelGraphNode>;
  nodeRadiusScale: (count: number) => number;
  transform: ZoomTransform;
  typeLayout: TypeLevelGraphLayout;
}) {
  const { context, nodeById, nodeRadiusScale, transform, typeLayout } = params;

  context.beginPath();
  context.globalAlpha = 0.58;
  context.strokeStyle = '#cbd5e1';
  context.lineWidth = Math.max(1.1 / transform.k, 0.16);
  for (const edge of typeLayout.edges) {
    drawTypeEdge({
      context,
      edge,
      nodeById,
      nodeRadiusScale,
    });
  }
  context.stroke();
}
