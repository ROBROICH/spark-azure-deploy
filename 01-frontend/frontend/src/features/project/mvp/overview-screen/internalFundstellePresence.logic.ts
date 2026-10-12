import {
  getNodesByType,
  type ProjectNodeIndex,
} from '@/db/nodes/examinationGraphModel';
import type { NodePayloadByType } from '@/db/nodes/types';

/**
 * Recursively resolves topic ancestors while memoizing every visited branch so
 * shared graph paths are not walked again for later fundstellen.
 *
 * @param index Project graph index.
 * @param startId Node id whose topic ancestors should be collected.
 * @param topicAncestorIdsByNodeId Cache of resolved topic ancestor ids.
 * @param visitingNodeIds Current recursion path used to break graph cycles.
 * @returns Topic ids reachable through parent edges.
 */
const collectTopicAncestorIds = (
  index: ProjectNodeIndex,
  startId: string,
  topicAncestorIdsByNodeId: Map<string, Set<string>>,
  visitingNodeIds = new Set<string>(),
) => {
  const cachedTopicIds = topicAncestorIdsByNodeId.get(startId);

  if (cachedTopicIds) {
    return cachedTopicIds;
  }

  if (visitingNodeIds.has(startId)) {
    return new Set<string>();
  }

  visitingNodeIds.add(startId);

  const topicIds = new Set<string>();

  for (const parentId of index.parentIdsByNodeId.get(startId) ?? []) {
    const parent = index.nodeById.get(parentId);

    if (parent?.nodeType === 'topic') {
      topicIds.add(parent.id);
    }

    for (const topicId of collectTopicAncestorIds(
      index,
      parentId,
      topicAncestorIdsByNodeId,
      visitingNodeIds,
    )) {
      topicIds.add(topicId);
    }
  }

  visitingNodeIds.delete(startId);
  topicAncestorIdsByNodeId.set(startId, topicIds);

  return topicIds;
};

const addTopicAncestorIds = (
  targetTopicIds: Set<string>,
  index: ProjectNodeIndex,
  ancestorId: string,
  topicAncestorIdsByNodeId: Map<string, Set<string>>,
) => {
  for (const topicId of collectTopicAncestorIds(
    index,
    ancestorId,
    topicAncestorIdsByNodeId,
  )) {
    targetTopicIds.add(topicId);
  }
};

/**
 * Separates topic reachability for a fundstelle's document and norm ancestors
 * so a topic is marked internal only when both sides meet at the same topic.
 *
 * @param index Project graph index.
 * @param fundstelleId Fundstelle id to inspect.
 * @param topicAncestorIdsByNodeId Cache shared across all fundstellen.
 * @returns Topic ids reached through document ancestors and norm ancestors.
 */
const collectFundstelleTopicIdsByAncestorType = (
  index: ProjectNodeIndex,
  fundstelleId: string,
  topicAncestorIdsByNodeId: Map<string, Set<string>>,
) => {
  const documentTopicIds = new Set<string>();
  const normTopicIds = new Set<string>();
  const seenAncestorIds = new Set<string>();
  const queue = [...(index.parentIdsByNodeId.get(fundstelleId) ?? [])];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const ancestorId = queue[queueIndex];
    queueIndex += 1;
    if (!ancestorId) {
      continue;
    }

    if (seenAncestorIds.has(ancestorId)) {
      continue;
    }

    seenAncestorIds.add(ancestorId);

    const ancestor = index.nodeById.get(ancestorId);

    if (ancestor?.nodeType === 'dokument' || ancestor?.nodeType === 'norm') {
      const topicIds =
        ancestor.nodeType === 'dokument' ? documentTopicIds : normTopicIds;
      addTopicAncestorIds(
        topicIds,
        index,
        ancestor.id,
        topicAncestorIdsByNodeId,
      );
    }

    queue.push(...(index.parentIdsByNodeId.get(ancestorId) ?? []));
  }

  return {
    documentTopicIds,
    normTopicIds,
  };
};

const markInternalFundstelleTopics = (
  presenceByTopicId: Map<string, boolean>,
  documentTopicIds: Set<string>,
  normTopicIds: Set<string>,
) => {
  for (const topicId of documentTopicIds) {
    if (presenceByTopicId.get(topicId) === false && normTopicIds.has(topicId)) {
      presenceByTopicId.set(topicId, true);
    }
  }
};

export const mapInternalFundstellePresenceByTopicId = (
  topics: NodePayloadByType<'topic'>[],
  index: ProjectNodeIndex,
) => {
  const presenceByTopicId = new Map(topics.map((topic) => [topic.id, false]));
  const topicAncestorIdsByNodeId = new Map<string, Set<string>>();

  for (const fundstelle of getNodesByType(index, 'fundstelle')) {
    const { documentTopicIds, normTopicIds } =
      collectFundstelleTopicIdsByAncestorType(
        index,
        fundstelle.id,
        topicAncestorIdsByNodeId,
      );

    markInternalFundstelleTopics(
      presenceByTopicId,
      documentTopicIds,
      normTopicIds,
    );
  }

  return presenceByTopicId;
};
