import { queryOnce } from '@tanstack/db';
import { inArray } from '@tanstack/react-db';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { ExaminationDb } from '@/db/nodes/createExaminationDb';
import {
  getNode,
  getNodesByType,
  type ProjectNodeIndex,
} from '@/db/nodes/examinationGraphModel';
import { ensureProjectGraphReady } from '@/db/nodes/projectGraphCache';
import type { NodeRef, NodeSummary } from '@/db/nodes/types';
import { isEwmsUnassignedSubtopicSelection } from './data/ewmsSubtopicSelection';
import type { EwmsSearch } from './ewms.search';

const EWMS_WORKSPACE_PRELOAD_NODE_TYPES = [
  'topic',
  'subtopic',
  'beteiligungs_eingang',
  'argument',
] satisfies NodeSummary['nodeType'][];

const dedupeNodeRefs = (nodeRefs: ReadonlyArray<NodeRef>) => {
  const refsByCompositeKey = new Map<string, NodeRef>();

  for (const nodeRef of nodeRefs) {
    refsByCompositeKey.set(toCompositeKey(nodeRef), nodeRef);
  }

  return [...refsByCompositeKey.values()];
};

const preloadNodeRefs = async (
  db: ExaminationDb,
  nodeRefs: ReadonlyArray<NodeRef>,
) => {
  const refs = dedupeNodeRefs(nodeRefs);

  if (refs.length === 0) {
    return;
  }

  const compositeKeys = toCompositeKey(refs);

  await queryOnce((q) =>
    q
      .from({ payloads: db.payloadsCollection })
      .where(({ payloads }) => inArray(payloads.compositeKey, compositeKeys)),
  );
};

export const collectEwmsPreloadRefs = (index: ProjectNodeIndex) =>
  dedupeNodeRefs([
    ...EWMS_WORKSPACE_PRELOAD_NODE_TYPES.flatMap((nodeType) =>
      getNodesByType(index, nodeType).map((summary) => ({
        id: summary.id,
        nodeType: summary.nodeType,
      })),
    ),
  ]);

/**
 * Maps cold-load EWMS URL state to payload refs without assuming that
 * `selectedObjectionId` is always a node id; row navigation stores file ids too.
 */
const getSearchScopedEwmsRefs = (
  index: ProjectNodeIndex,
  search: EwmsSearch,
) => {
  const refs: NodeRef[] = [];

  if (search.selectedArgumentId) {
    refs.push({
      id: search.selectedArgumentId,
      nodeType: 'argument',
    });
  }

  if (search.selectedTopicId) {
    refs.push({
      id: search.selectedTopicId,
      nodeType: 'topic',
    });
  }

  if (
    search.selectedSubtopicId &&
    !isEwmsUnassignedSubtopicSelection(search.selectedSubtopicId)
  ) {
    refs.push({
      id: search.selectedSubtopicId,
      nodeType: 'subtopic',
    });
  }

  if (search.expandedTopicGroupId) {
    refs.push({
      id: search.expandedTopicGroupId,
      nodeType: 'topic',
    });
  }

  if (search.selectedObjectionId) {
    const selectedNode = getNode(index, search.selectedObjectionId);

    if (selectedNode?.nodeType === 'beteiligungs_eingang') {
      refs.push({
        id: selectedNode.id,
        nodeType: selectedNode.nodeType,
      });
    }
  }

  return refs;
};

export const collectEwmsRoutePreloadRefs = (
  index: ProjectNodeIndex,
  search: EwmsSearch,
) =>
  dedupeNodeRefs([
    ...collectEwmsPreloadRefs(index),
    ...getSearchScopedEwmsRefs(index, search),
  ]);

export const preloadEwmsRouteData = async (
  db: ExaminationDb,
  search: EwmsSearch,
) => {
  const index = await ensureProjectGraphReady(db.nodesCollection, async () => {
    await db.nodesCollection.preload();
    return Array.from(db.nodesCollection.state.values());
  });

  await preloadNodeRefs(db, collectEwmsRoutePreloadRefs(index, search));
};
