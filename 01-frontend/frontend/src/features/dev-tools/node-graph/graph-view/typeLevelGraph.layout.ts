import type { NodeTypeLiteral } from '@/db/nodes/types';
import {
  isProjectScopedRootType,
  PROJECT_SCOPED_ROOT_TYPES,
  ROOT_TYPE,
  TOPIC_NORM_TYPE,
} from './typeLevelGraph.constants';
import { compareTypePriority } from './typeLevelGraph.sort';

const HORIZONTAL_GAP = 220;
const VERTICAL_GAP = 180;
const HORIZONTAL_MARGIN = 180;
export const VERTICAL_MARGIN = 96;

type LayoutViewport = {
  height: number;
  width: number;
};

type TypeDepth = Map<NodeTypeLiteral, number>;

type EdgeCountByType = Map<NodeTypeLiteral, Map<NodeTypeLiteral, number>>;

function getSortedNextTypes(
  currentType: NodeTypeLiteral,
  outgoingCounts: EdgeCountByType,
  presentTypes: NodeTypeLiteral[],
) {
  return Array.from(outgoingCounts.get(currentType)?.keys() ?? [])
    .filter((type) => presentTypes.includes(type))
    .sort(compareTypePriority);
}

function enqueueType(
  nextType: NodeTypeLiteral,
  nextDepth: number,
  depthByType: TypeDepth,
  queue: NodeTypeLiteral[],
) {
  if (depthByType.has(nextType)) {
    return;
  }

  depthByType.set(nextType, nextDepth);
  queue.push(nextType);
}

function getNextFallbackDepth(
  depthByType: TypeDepth,
  presentTypes: NodeTypeLiteral[],
) {
  return (
    Math.max(...Array.from(depthByType.values()), 0) +
    (presentTypes.length > depthByType.size ? 1 : 0)
  );
}

function getIncomingDepths(
  type: NodeTypeLiteral,
  incomingCounts: EdgeCountByType,
  depthByType: TypeDepth,
) {
  return Array.from(incomingCounts.get(type)?.keys() ?? [])
    .map((sourceType) => depthByType.get(sourceType))
    .filter((depth): depth is number => depth !== undefined);
}

function setProjectScopedRootDepths(
  depthByType: TypeDepth,
  presentTypes: NodeTypeLiteral[],
) {
  for (const projectScopedType of PROJECT_SCOPED_ROOT_TYPES) {
    if (!presentTypes.includes(projectScopedType)) {
      continue;
    }

    depthByType.set(projectScopedType, 1);
  }
}

/**
 * Assigns vertical layers to node types from the live type adjacency map.
 *
 * The graph is not guaranteed to be a strict tree, so unreachable or cyclic
 * types fall back to later rows after the breadth-first pass from the root.
 */
export function buildDepthMap(
  presentTypes: NodeTypeLiteral[],
  incomingCounts: EdgeCountByType,
  outgoingCounts: EdgeCountByType,
  rootType: NodeTypeLiteral,
) {
  const depthByType: TypeDepth = new Map([[rootType, 0]]);
  const queue: NodeTypeLiteral[] = [rootType];

  while (queue.length > 0) {
    const currentType = queue.shift();

    if (!currentType) {
      continue;
    }

    const currentDepth = depthByType.get(currentType) ?? 0;

    for (const nextType of getSortedNextTypes(
      currentType,
      outgoingCounts,
      presentTypes,
    )) {
      enqueueType(nextType, currentDepth + 1, depthByType, queue);
    }
  }

  if (rootType === ROOT_TYPE) {
    setProjectScopedRootDepths(depthByType, presentTypes);
  }

  let nextDepth = getNextFallbackDepth(depthByType, presentTypes);

  for (const type of presentTypes) {
    if (depthByType.has(type)) {
      continue;
    }

    const incomingDepths = getIncomingDepths(type, incomingCounts, depthByType);

    if (incomingDepths.length > 0) {
      depthByType.set(type, Math.max(...incomingDepths) + 1);
      continue;
    }

    depthByType.set(type, nextDepth);
    nextDepth += 1;
  }

  return depthByType;
}

export function applyPreferredTypeDepths(
  depthByType: TypeDepth,
  presentTypes: NodeTypeLiteral[],
) {
  if (!presentTypes.some(isProjectScopedRootType)) {
    return depthByType;
  }

  setProjectScopedRootDepths(depthByType, presentTypes);

  for (const type of presentTypes) {
    if (isProjectScopedRootType(type)) {
      continue;
    }

    depthByType.set(type, Math.max(depthByType.get(type) ?? 2, 2));
  }

  if (presentTypes.includes(TOPIC_NORM_TYPE)) {
    depthByType.set(TOPIC_NORM_TYPE, 2);
  }

  return depthByType;
}

/**
 * Computes a barycenter-style anchor for one type based on already-placed
 * parent layers so later sorting keeps related types visually closer together.
 */
function getAnchorPosition(
  type: NodeTypeLiteral,
  depthByType: TypeDepth,
  incomingCounts: EdgeCountByType,
  previousLayerOrder: Map<NodeTypeLiteral, number>,
) {
  const anchors: number[] = [];

  for (const [sourceType, count] of incomingCounts.get(type) ?? []) {
    if ((depthByType.get(sourceType) ?? -1) >= (depthByType.get(type) ?? 0)) {
      continue;
    }

    const order = previousLayerOrder.get(sourceType);

    if (order === undefined) {
      continue;
    }

    for (let index = 0; index < count; index += 1) {
      anchors.push(order);
    }
  }

  if (anchors.length === 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  return anchors.reduce((sum, value) => sum + value, 0) / anchors.length;
}

function sortLayerTypes(
  layerTypes: NodeTypeLiteral[],
  depth: number,
  depthByType: TypeDepth,
  incomingCounts: EdgeCountByType,
  previousLayerOrder: Map<NodeTypeLiteral, number>,
  nodeCountsByType: Map<NodeTypeLiteral, number>,
  degreeByType: Map<NodeTypeLiteral, number>,
) {
  return [...layerTypes].sort((left, right) => {
    if (depth === 0) {
      return compareTypePriority(left, right);
    }

    const leftAnchor = getAnchorPosition(
      left,
      depthByType,
      incomingCounts,
      previousLayerOrder,
    );
    const rightAnchor = getAnchorPosition(
      right,
      depthByType,
      incomingCounts,
      previousLayerOrder,
    );

    if (leftAnchor !== rightAnchor) {
      return leftAnchor - rightAnchor;
    }

    const degreeDifference =
      (degreeByType.get(right) ?? 0) - (degreeByType.get(left) ?? 0);

    if (degreeDifference !== 0) {
      return degreeDifference;
    }

    const countDifference =
      (nodeCountsByType.get(right) ?? 0) - (nodeCountsByType.get(left) ?? 0);

    if (countDifference !== 0) {
      return countDifference;
    }

    return compareTypePriority(left, right);
  });
}

function groupTypesByDepth(
  presentTypes: NodeTypeLiteral[],
  depthByType: TypeDepth,
) {
  const typesByDepth = new Map<number, NodeTypeLiteral[]>();

  for (const type of presentTypes) {
    const depth = depthByType.get(type) ?? 0;
    const typesAtDepth = typesByDepth.get(depth);

    if (typesAtDepth) {
      typesAtDepth.push(type);
      continue;
    }

    typesByDepth.set(depth, [type]);
  }

  return Array.from(typesByDepth.entries()).sort(
    ([leftDepth], [rightDepth]) => leftDepth - rightDepth,
  );
}

export function buildNodePositions(
  presentTypes: NodeTypeLiteral[],
  depthByType: TypeDepth,
  incomingCounts: EdgeCountByType,
  nodeCountsByType: Map<NodeTypeLiteral, number>,
  degreeByType: Map<NodeTypeLiteral, number>,
  viewport?: LayoutViewport,
) {
  const depthEntries = groupTypesByDepth(presentTypes, depthByType);
  const previousLayerOrder = new Map<NodeTypeLiteral, number>();
  const positions = new Map<NodeTypeLiteral, { x: number; y: number }>();
  const maxLayerSize = Math.max(
    ...depthEntries.map(([, types]) => types.length),
    1,
  );
  const maxDepth = Math.max(...depthEntries.map(([depth]) => depth), 0);
  const minWidth =
    HORIZONTAL_MARGIN * 2 + Math.max(maxLayerSize - 1, 0) * HORIZONTAL_GAP;
  const minHeight = VERTICAL_MARGIN * 2 + maxDepth * VERTICAL_GAP;
  const width = Math.max(minWidth, viewport?.width ?? 0);
  const height = Math.max(minHeight, viewport?.height ?? 0);
  const horizontalGap =
    maxLayerSize > 1
      ? (width - HORIZONTAL_MARGIN * 2) / (maxLayerSize - 1)
      : HORIZONTAL_GAP;
  const verticalGap =
    maxDepth > 0 ? (height - VERTICAL_MARGIN * 2) / maxDepth : VERTICAL_GAP;

  for (const [depth, layerTypes] of depthEntries) {
    const orderedTypes = sortLayerTypes(
      layerTypes,
      depth,
      depthByType,
      incomingCounts,
      previousLayerOrder,
      nodeCountsByType,
      degreeByType,
    );
    const layerWidth = (orderedTypes.length - 1) * horizontalGap;
    const centerX = width / 2;

    orderedTypes.forEach((type, index) => {
      positions.set(type, {
        x: centerX - layerWidth / 2 + index * horizontalGap,
        y: VERTICAL_MARGIN + depth * verticalGap,
      });
      previousLayerOrder.set(type, index);
    });
  }

  return {
    height,
    positions,
    verticalGap,
    width,
  };
}

export function computeNearestNodeDistance(
  type: NodeTypeLiteral,
  positions: Map<NodeTypeLiteral, { x: number; y: number }>,
) {
  const currentPosition = positions.get(type);

  if (!currentPosition) {
    return Number.POSITIVE_INFINITY;
  }

  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const [otherType, otherPosition] of positions) {
    if (otherType === type) {
      continue;
    }

    const distance = Math.hypot(
      otherPosition.x - currentPosition.x,
      otherPosition.y - currentPosition.y,
    );

    if (distance < nearestDistance) {
      nearestDistance = distance;
    }
  }

  return nearestDistance;
}
