import type { ZoomTransform } from 'd3';
import {
  drawActualEdges,
  drawActualNode,
  drawPrototypeNodes,
  drawTypeEdges,
  drawTypeLabels,
} from './graphDataCanvasDrawers';
import type { GraphDataScene } from './graphDataScene.logic';
import type {
  TypeLevelGraphLayout,
  TypeLevelGraphNode,
} from './typeLevelGraph.logic';

function getConnectedGraphDataNodeIds(
  scene: GraphDataScene,
  hoveredNodeId: string | null,
) {
  const connectedNodeIds = new Set<string>();

  if (hoveredNodeId === null) {
    return connectedNodeIds;
  }

  for (const edge of scene.actualEdges) {
    if (edge.source.id === hoveredNodeId) {
      connectedNodeIds.add(edge.target.id);
    }

    if (edge.target.id === hoveredNodeId) {
      connectedNodeIds.add(edge.source.id);
    }
  }

  return connectedNodeIds;
}

function setCanvasSize(params: {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  pixelRatio: number;
  viewport: { height: number; width: number };
}) {
  const { canvas, context, pixelRatio, viewport } = params;
  const width = Math.max(1, Math.floor(viewport.width * pixelRatio));
  const height = Math.max(1, Math.floor(viewport.height * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);
}

/**
 * Draws the whole graph scene in one canvas pass. The branching stays local so
 * the React render path never expands thousands of SVG/DOM nodes.
 */
export function drawGraphDataCanvas(params: {
  canvas: HTMLCanvasElement;
  fitScale: number;
  hoveredNodeId: string | null;
  nodeById: Map<string, TypeLevelGraphNode>;
  nodeRadiusScale: (count: number) => number;
  scene: GraphDataScene;
  transform: ZoomTransform;
  typeLayout: TypeLevelGraphLayout;
  viewport: { height: number; width: number };
}) {
  const {
    canvas,
    fitScale,
    hoveredNodeId,
    nodeById,
    nodeRadiusScale,
    scene,
    transform,
    typeLayout,
    viewport,
  } = params;
  const context = canvas.getContext('2d');

  if (!context || viewport.height === 0 || viewport.width === 0) {
    return;
  }

  setCanvasSize({
    canvas,
    context,
    pixelRatio: window.devicePixelRatio || 1,
    viewport,
  });
  context.save();
  context.translate(transform.x, transform.y);
  context.scale(transform.k, transform.k);

  const connectedNodeIds = getConnectedGraphDataNodeIds(scene, hoveredNodeId);
  drawTypeEdges({ context, nodeById, nodeRadiusScale, transform, typeLayout });
  drawActualEdges({ context, hoveredNodeId, scene, transform });
  drawPrototypeNodes({
    context,
    nodeRadiusScale,
    prototypeNodes: scene.prototypeNodes,
  });

  for (const node of scene.actualNodes) {
    drawActualNode({
      connectedNodeIds,
      context,
      hoveredNodeId,
      node,
      transform,
    });
  }

  drawTypeLabels({
    context,
    nodeRadiusScale,
    relativeZoom: transform.k / fitScale,
    scene,
  });
  context.restore();
  context.globalAlpha = 1;
}
