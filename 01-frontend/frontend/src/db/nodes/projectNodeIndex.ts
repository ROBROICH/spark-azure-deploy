import { invariant } from 'es-toolkit/util';
import {
  countTypedDescendants,
  createTypedDescendantCacheKey,
  getFirstTypedDescendantRef,
  getTypedDescendantRefs,
  hasTypedDescendant,
  type TypedDescendantCacheKey,
} from './examinationGraphTraversal';
import {
  collectProjectRootNodeIds,
  countProjectNodeEdgesForSummary,
  createProjectNodeIndexCollections,
  registerProjectNodeSummary,
} from './projectNodeIndex.helpers';
import type { NodeRef, NodeSummary, NodeTypeLiteral } from './types';

type NodeTypedDescendantCacheKey = TypedDescendantCacheKey<NodeTypeLiteral>;

const MAX_DESCENDANT_CACHE_ENTRIES = 500;

export type ProjectNodeIndex = {
  childrenByNodeId: Map<string, string[]>;
  countByStartIdAndType: Map<NodeTypedDescendantCacheKey, number>;
  edgeCount: number;
  firstRefByStartIdAndType: Map<NodeTypedDescendantCacheKey, NodeRef | null>;
  hasByStartIdAndType: Map<NodeTypedDescendantCacheKey, boolean>;
  idsByStartId: Map<string, string[]>;
  nodeById: Map<string, NodeSummary>;
  nodeCountsByType: Map<NodeTypeLiteral, number>;
  nodesByType: Map<NodeTypeLiteral, NodeSummary[]>;
  parentIdsByNodeId: Map<string, string[]>;
  refsByStartId: Map<string, NodeRef[]>;
  refsByStartIdAndType: Map<NodeTypedDescendantCacheKey, NodeRef[]>;
  rootNodeIds: string[];
};

const createEmptyDescendantCaches = () => ({
  countByStartIdAndType: new Map<NodeTypedDescendantCacheKey, number>(),
  firstRefByStartIdAndType: new Map<
    NodeTypedDescendantCacheKey,
    NodeRef | null
  >(),
  hasByStartIdAndType: new Map<NodeTypedDescendantCacheKey, boolean>(),
  idsByStartId: new Map<string, string[]>(),
  refsByStartId: new Map<string, NodeRef[]>(),
  refsByStartIdAndType: new Map<NodeTypedDescendantCacheKey, NodeRef[]>(),
});

const setCappedMapEntry = <TKey, TValue>(
  map: Map<TKey, TValue>,
  key: TKey,
  value: TValue,
) => {
  if (map.has(key)) {
    map.delete(key);
  }

  map.set(key, value);

  if (map.size <= MAX_DESCENDANT_CACHE_ENTRIES) {
    return;
  }

  const oldestKey = map.keys().next().value;

  if (oldestKey !== undefined) {
    map.delete(oldestKey);
  }
};

const enqueueUnseenNode = (
  queue: string[],
  seen: Set<string>,
  nodeId: string,
) => {
  if (seen.has(nodeId)) {
    return;
  }

  seen.add(nodeId);
  queue.push(nodeId);
};

const collectDescendantIds = (
  index: ProjectNodeIndex,
  startId: string,
): string[] => {
  const ids: string[] = [];
  const queue = [startId];
  const seen = new Set(queue);

  let currentIndex = 0;

  while (currentIndex < queue.length) {
    const nodeId = queue[currentIndex];
    invariant(nodeId !== undefined, 'Expected queued node id');
    currentIndex += 1;
    ids.push(nodeId);

    for (const childId of index.childrenByNodeId.get(nodeId) ?? []) {
      enqueueUnseenNode(queue, seen, childId);
    }
  }

  return ids;
};

/**
 * Builds the project node index and descendant caches from node summaries.
 * The returned index keeps adjacency, type buckets, and capped descendant
 * lookup caches in sync for downstream graph queries.
 */
export const buildProjectNodeIndex = (
  summaries: ReadonlyArray<NodeSummary>,
): ProjectNodeIndex => {
  const collections = createProjectNodeIndexCollections();

  for (const summary of summaries) {
    registerProjectNodeSummary(collections, summary);
  }

  let edgeCount = 0;
  const edgeSetByParent = new Map<string, Set<string>>();

  for (const summary of collections.nodeById.values()) {
    edgeCount += countProjectNodeEdgesForSummary(
      collections,
      edgeSetByParent,
      summary,
    );
  }

  return {
    childrenByNodeId: collections.childrenByNodeId,
    edgeCount,
    nodeById: collections.nodeById,
    nodeCountsByType: collections.nodeCountsByType,
    nodesByType: collections.nodesByType,
    parentIdsByNodeId: collections.parentIdsByNodeId,
    rootNodeIds: collectProjectRootNodeIds(
      collections.nodeById.keys(),
      collections.parentIdsByNodeId,
    ),
    ...createEmptyDescendantCaches(),
  };
};

export const hasNode = (index: ProjectNodeIndex, nodeId: string) => {
  return index.nodeById.has(nodeId);
};

export const getNode = (index: ProjectNodeIndex, nodeId: string) => {
  return index.nodeById.get(nodeId) ?? null;
};

const readDescendantIds = (index: ProjectNodeIndex, startId: string) => {
  const cachedIds = index.idsByStartId.get(startId);

  if (cachedIds) {
    return cachedIds;
  }

  const ids = collectDescendantIds(index, startId);
  setCappedMapEntry(index.idsByStartId, startId, ids);

  return ids;
};

export const getDescendantIds = (index: ProjectNodeIndex, startId: string) => {
  if (!hasNode(index, startId)) {
    return [];
  }

  return readDescendantIds(index, startId);
};

export const getDescendantNodeRefs = (
  index: ProjectNodeIndex,
  startId: string,
): NodeRef[] => {
  if (!hasNode(index, startId)) {
    return [];
  }

  const cachedRefs = index.refsByStartId.get(startId);

  if (cachedRefs) {
    return cachedRefs;
  }

  const refs = readDescendantIds(index, startId).flatMap((nodeId) => {
    const node = index.nodeById.get(nodeId);

    return node ? [node] : [];
  });

  setCappedMapEntry(index.refsByStartId, startId, refs);

  return refs;
};

export function getDescendantNodeRefsByType<T extends NodeTypeLiteral>(
  index: ProjectNodeIndex,
  startId: string,
  type: T,
): (NodeRef & { node_type: T })[] {
  if (!hasNode(index, startId)) {
    return [];
  }

  const cacheKey = createTypedDescendantCacheKey(startId, type);
  const cachedRefs = index.refsByStartIdAndType.get(cacheKey);

  if (cachedRefs) {
    return cachedRefs as (NodeRef & { node_type: T })[];
  }

  const refs = getTypedDescendantRefs(
    {
      childrenByNodeId: index.childrenByNodeId,
      nodeById: index.nodeById,
    },
    startId,
    type,
  );

  setCappedMapEntry(index.refsByStartIdAndType, cacheKey, refs);

  return refs;
}

export const countDescendantsByType = (
  index: ProjectNodeIndex,
  startId: string,
  type: NodeTypeLiteral,
) => {
  if (!hasNode(index, startId)) {
    return 0;
  }

  const cacheKey = createTypedDescendantCacheKey(startId, type);
  const cachedCount = index.countByStartIdAndType.get(cacheKey);

  if (cachedCount !== undefined) {
    return cachedCount;
  }

  const count = countTypedDescendants(
    {
      childrenByNodeId: index.childrenByNodeId,
      nodeById: index.nodeById,
    },
    startId,
    type,
  );

  setCappedMapEntry(index.countByStartIdAndType, cacheKey, count);

  return count;
};

export const hasDescendantByType = (
  index: ProjectNodeIndex,
  startId: string,
  type: NodeTypeLiteral,
) => {
  if (!hasNode(index, startId)) {
    return false;
  }

  const cacheKey = createTypedDescendantCacheKey(startId, type);
  const cached = index.hasByStartIdAndType.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const hasMatch = hasTypedDescendant(
    {
      childrenByNodeId: index.childrenByNodeId,
      nodeById: index.nodeById,
    },
    startId,
    type,
  );

  setCappedMapEntry(index.hasByStartIdAndType, cacheKey, hasMatch);

  return hasMatch;
};

export function getFirstDescendantNodeRefByType<T extends NodeTypeLiteral>(
  index: ProjectNodeIndex,
  startId: string,
  type: T,
): (NodeRef & { node_type: T }) | null {
  if (!hasNode(index, startId)) {
    return null;
  }

  const cacheKey = createTypedDescendantCacheKey(startId, type);
  const cached = index.firstRefByStartIdAndType.get(cacheKey);

  if (cached !== undefined) {
    return cached as (NodeRef & { node_type: T }) | null;
  }

  const firstRef = getFirstTypedDescendantRef(
    {
      childrenByNodeId: index.childrenByNodeId,
      nodeById: index.nodeById,
    },
    startId,
    type,
  );

  setCappedMapEntry(index.firstRefByStartIdAndType, cacheKey, firstRef);

  return firstRef;
}

export function getChildNodes(
  index: ProjectNodeIndex,
  nodeRef: NodeRef | string,
): NodeSummary[];
export function getChildNodes<T extends NodeTypeLiteral>(
  index: ProjectNodeIndex,
  nodeRef: NodeRef | string,
  type: T,
): NodeSummary<T>[];
export function getChildNodes<T extends NodeTypeLiteral>(
  index: ProjectNodeIndex,
  nodeRef: NodeRef | string,
  type?: T,
) {
  const nodeId = typeof nodeRef === 'string' ? nodeRef : nodeRef.id;

  if (!hasNode(index, nodeId)) {
    return [];
  }

  return (index.childrenByNodeId.get(nodeId) ?? []).flatMap((childId) => {
    const child = index.nodeById.get(childId);

    if (type && child?.node_type !== type) {
      return [];
    }

    return child ? [child] : [];
  }) as T extends NodeTypeLiteral ? NodeSummary<T>[] : NodeSummary[];
}

export const getRootNodeIds = (index: ProjectNodeIndex) => {
  return index.rootNodeIds;
};

export function getNodesByType<T extends NodeTypeLiteral>(
  index: ProjectNodeIndex,
  type: T,
): NodeSummary<T>[] {
  return (index.nodesByType.get(type) ?? []) as NodeSummary<T>[];
}

export const countNodesByType = (index: ProjectNodeIndex) => {
  return index.nodeCountsByType;
};
