import type { NodeTypeLiteral } from '@/db/nodes/types';
import type { ZoomTransform } from 'd3';
import type {
  GraphDataActualNode,
  GraphDataLayout,
} from './graphDataView.logic';
import {
  GRAPH_ROOT_NODE_ID,
  type TypeLevelGraphNode,
} from './typeLevelGraph.logic';

const MIN_ACTUAL_NODE_REVEAL = 0.05;

export type GraphDataRenderNode = GraphDataActualNode & {
  alpha: number;
  displayRadius: number;
  displayX: number;
  displayY: number;
  typeReveal: number;
};

export type GraphDataRenderEdge = {
  alpha: number;
  source: GraphDataRenderNode;
  target: GraphDataRenderNode;
};

export type GraphDataPrototypeRenderNode = TypeLevelGraphNode & {
  reveal: number;
};

export type GraphDataScene = {
  actualEdges: GraphDataRenderEdge[];
  actualNodes: GraphDataRenderNode[];
  activeTypeCount: number;
  focusedTypeLabel: string | null;
  prototypeNodes: GraphDataPrototypeRenderNode[];
  revealByType: Map<NodeTypeLiteral, number>;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

function interpolate(left: number, right: number, progress: number) {
  return left + (right - left) * progress;
}

function getGraphDataTypeReveal(params: {
  fitScale: number;
  node: TypeLevelGraphNode;
  transform: ZoomTransform;
  viewport: { height: number; width: number };
}) {
  const { fitScale, node, transform, viewport } = params;

  if (node.id === GRAPH_ROOT_NODE_ID || viewport.width === 0) {
    return 0;
  }

  const relativeZoom = transform.k / fitScale;
  const screenX = transform.applyX(node.x);
  const screenY = transform.applyY(node.y);
  const distanceFromFocus = Math.hypot(
    screenX - viewport.width / 2,
    screenY - viewport.height / 2,
  );
  const focusRadius = Math.max(
    140,
    Math.min(viewport.width, viewport.height) * 0.38,
  );
  const zoomProgress = clamp((relativeZoom - 1.08) / 1.24, 0, 1);
  const focusProgress = clamp(1 - distanceFromFocus / focusRadius, 0, 1);
  const screenCoverageBoost = clamp((relativeZoom - 1.7) / 1.4, 0, 1);
  const isNearViewport =
    screenX >= -viewport.width * 0.2 &&
    screenX <= viewport.width * 1.2 &&
    screenY >= -viewport.height * 0.2 &&
    screenY <= viewport.height * 1.2;

  return clamp(
    Math.max(
      zoomProgress * focusProgress,
      isNearViewport ? screenCoverageBoost * 0.45 : 0,
    ),
    0,
    1,
  );
}

function buildGraphDataPrototypeNodes(params: {
  fitScale: number;
  layout: GraphDataLayout;
  transform: ZoomTransform;
  viewport: { height: number; width: number };
}) {
  const { fitScale, layout, transform, viewport } = params;
  const revealByType = new Map<NodeTypeLiteral, number>();
  const prototypeNodes = layout.typeLayout.nodes.map((node) => {
    const reveal =
      node.nodeType === null
        ? 0
        : getGraphDataTypeReveal({
            fitScale,
            node,
            transform,
            viewport,
          });

    if (node.nodeType !== null) {
      revealByType.set(node.nodeType, reveal);
    }

    return {
      ...node,
      reveal,
    } satisfies GraphDataPrototypeRenderNode;
  });

  return {
    prototypeNodes,
    revealByType,
  };
}

/**
 * Finds the expanded type count and strongest focused type label for the scene.
 *
 * @param prototypeNodes Type-level nodes with their current zoom reveal value.
 * @returns Focus summary used by the data graph header.
 */
function getGraphDataFocus(prototypeNodes: GraphDataPrototypeRenderNode[]) {
  let activeTypeCount = 0;
  let focusedTypeLabel: string | null = null;
  let focusedTypeReveal = 0;

  for (const node of prototypeNodes) {
    if (node.nodeType === null) {
      continue;
    }

    if (node.reveal > 0.38) {
      activeTypeCount += 1;
    }

    if (node.reveal > focusedTypeReveal) {
      focusedTypeReveal = node.reveal;
      focusedTypeLabel = `${node.label} (${node.count})`;
    }
  }

  return {
    activeTypeCount,
    focusedTypeLabel: focusedTypeReveal < 0.36 ? null : focusedTypeLabel,
  };
}

function buildGraphDataRenderNode(params: {
  layout: GraphDataLayout;
  node: GraphDataActualNode;
  reveal: number;
  typeRadiusScale: (count: number) => number;
}) {
  const { layout, node, reveal, typeRadiusScale } = params;
  const typeNode = layout.typeNodesByType.get(node.nodeType);

  if (!typeNode) {
    return null;
  }

  const easedReveal = easeOutCubic(reveal);
  const prototypeRadius = typeRadiusScale(typeNode.count);

  return {
    ...node,
    alpha: clamp((reveal - MIN_ACTUAL_NODE_REVEAL) / 0.72, 0, 1),
    displayRadius: interpolate(
      prototypeRadius * 0.18,
      node.radius,
      easedReveal,
    ),
    displayX: interpolate(typeNode.x, node.x, easedReveal),
    displayY: interpolate(typeNode.y, node.y, easedReveal),
    typeReveal: reveal,
  } satisfies GraphDataRenderNode;
}

function buildGraphDataRenderNodes(params: {
  layout: GraphDataLayout;
  revealByType: Map<NodeTypeLiteral, number>;
  typeRadiusScale: (count: number) => number;
}) {
  const { layout, revealByType, typeRadiusScale } = params;
  const actualNodes: GraphDataRenderNode[] = [];

  for (const node of layout.actualNodes) {
    const reveal = revealByType.get(node.nodeType) ?? 0;

    if (reveal < MIN_ACTUAL_NODE_REVEAL) {
      continue;
    }

    const displayNode = buildGraphDataRenderNode({
      layout,
      node,
      reveal,
      typeRadiusScale,
    });

    if (displayNode) {
      actualNodes.push(displayNode);
    }
  }

  return actualNodes;
}

function buildGraphDataRenderEdges(
  layout: GraphDataLayout,
  actualNodes: GraphDataRenderNode[],
) {
  const actualNodesById = new Map(actualNodes.map((node) => [node.id, node]));
  const actualEdges: GraphDataRenderEdge[] = [];

  for (const edge of layout.actualEdges) {
    const source = actualNodesById.get(edge.source);
    const target = actualNodesById.get(edge.target);

    if (!source || !target) {
      continue;
    }

    const alpha = Math.min(source.alpha, target.alpha) * 0.42;

    if (alpha >= 0.04) {
      actualEdges.push({ alpha, source, target });
    }
  }

  return actualEdges;
}

/**
 * Creates the zoom-dependent render scene while keeping the expensive graph
 * layout immutable. This centralizes reveal thresholds, interpolation, and
 * edge filtering for the canvas draw and hover hit-testing passes.
 */
export function buildGraphDataScene(params: {
  fitScale: number;
  layout: GraphDataLayout;
  transform: ZoomTransform;
  typeRadiusScale: (count: number) => number;
  viewport: { height: number; width: number };
}): GraphDataScene {
  const { fitScale, layout, transform, typeRadiusScale, viewport } = params;
  const { prototypeNodes, revealByType } = buildGraphDataPrototypeNodes({
    fitScale,
    layout,
    transform,
    viewport,
  });
  const focus = getGraphDataFocus(prototypeNodes);
  const actualNodes = buildGraphDataRenderNodes({
    layout,
    revealByType,
    typeRadiusScale,
  });

  return {
    actualEdges: buildGraphDataRenderEdges(layout, actualNodes),
    actualNodes,
    activeTypeCount: focus.activeTypeCount,
    focusedTypeLabel: focus.focusedTypeLabel,
    prototypeNodes,
    revealByType,
  };
}
