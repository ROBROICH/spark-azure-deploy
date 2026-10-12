import { queryOnce } from '@tanstack/db';
import { inArray } from '@tanstack/react-db';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { ExaminationDb } from '@/db/nodes/createExaminationDb';
import {
  getDescendantNodeRefs,
  getNode,
  getNodesByType,
  hasNode,
  type ProjectNodeIndex,
} from '@/db/nodes/examinationGraphModel';
import { ensureProjectGraphReady } from '@/db/nodes/projectGraphCache';
import { getFeedbackRefsForTarget } from '@/features/feedback/useFeedbackLookup';
import type {
  NodeRef,
  NodeRefByType,
  NodeSummary,
  NodeTypeLiteral,
} from '@/db/nodes/types';
import type { RpbSearch } from './rpb.search';
import {
  isRpbFeedbackTargetNodeType,
  type RpbFeedbackTargetNodeType,
} from './rpbFeedbackTarget';
import {
  getRpbSonstigeArgumentRefs,
  RPB_PARTICIPATION_SONSTIGE_SUBTOPIC_ID,
} from './ai-assistance-swimlane/participation/rpbParticipationArguments';

const TOPIC_PRELOAD_NODE_TYPES = new Set<NodeSummary['nodeType']>([
  'absatz',
  'dokument',
  'norm',
  'satz',
  'subtopic',
  'topic_norm',
]);

const SATZ_BEWERTUNG_PRELOAD_NODE_TYPES = new Set<NodeSummary['nodeType']>([
  'bewertung',
  'bewertung_kapitel',
  'bewertung_quelle',
]);

const RECHTSMETHODIK_PRELOAD_NODE_TYPES = new Set<NodeSummary['nodeType']>([
  'atomares_tbm',
  'auslegungsvorschlag',
  'bestimmter_rechtsbegriff',
  'ermessensart',
  'ermessensspielraum',
  'expliziter_verweis',
  'legaldefinition',
  'rechtsfolge',
  'sollensanordnungen',
  'unbestimmter_rechtsbegriff',
]);

const dedupeNodeRefs = (nodeRefs: ReadonlyArray<NodeRef>) => {
  const refsByCompositeKey = new Map<string, NodeRef>();

  for (const nodeRef of nodeRefs) {
    refsByCompositeKey.set(toCompositeKey(nodeRef), nodeRef);
  }

  return [...refsByCompositeKey.values()];
};

const getProjectWideRpbRefs = (
  index: Awaited<ReturnType<typeof ensureProjectGraphReady>>,
) => {
  return [...getNodesByType(index, 'vae_node')].map((summary) => ({
    id: summary.id,
    nodeType: summary.nodeType,
  }));
};

const getSatzBewertungScopedRpbRefs = (
  index: Awaited<ReturnType<typeof ensureProjectGraphReady>>,
  satzId: string | undefined,
) => {
  if (!satzId || !hasNode(index, satzId)) {
    return [];
  }

  return getDescendantNodeRefs(index, satzId).filter((nodeRef) =>
    SATZ_BEWERTUNG_PRELOAD_NODE_TYPES.has(nodeRef.nodeType),
  );
};

const getTopicScopedRpbRefs = (
  index: Awaited<ReturnType<typeof ensureProjectGraphReady>>,
  topicId: string | undefined,
) => {
  if (!topicId || !hasNode(index, topicId)) {
    return [];
  }

  return getDescendantNodeRefs(index, topicId).filter((nodeRef) =>
    TOPIC_PRELOAD_NODE_TYPES.has(nodeRef.nodeType),
  );
};

const getTopicNormScopedRpbRefs = (
  index: Awaited<ReturnType<typeof ensureProjectGraphReady>>,
  topicNormId: string | undefined,
) => {
  if (!topicNormId || !hasNode(index, topicNormId)) {
    return [];
  }

  return getDescendantNodeRefs(index, topicNormId).filter((nodeRef) =>
    TOPIC_PRELOAD_NODE_TYPES.has(nodeRef.nodeType),
  );
};

const getParticipationSubtopicScopedRpbRefs = (
  index: Awaited<ReturnType<typeof ensureProjectGraphReady>>,
  topicId: string | undefined,
  participationSubtopicId: string | undefined,
) => {
  if (!participationSubtopicId) {
    return [];
  }

  if (participationSubtopicId === RPB_PARTICIPATION_SONSTIGE_SUBTOPIC_ID) {
    if (!topicId || !hasNode(index, topicId)) {
      return [];
    }

    return getRpbSonstigeArgumentRefs(index, {
      id: topicId,
      nodeType: 'topic',
    });
  }

  if (!hasNode(index, participationSubtopicId)) {
    return [];
  }

  return [
    {
      id: participationSubtopicId,
      nodeType: 'subtopic',
    } satisfies NodeRefByType<'subtopic'>,
    ...getDescendantNodeRefs(index, participationSubtopicId).filter(
      (nodeRef) => nodeRef.nodeType === 'argument',
    ),
  ];
};

/** Maps deep-link RPB search params to the exact node refs the first paint needs immediately. */
const getSearchScopedRpbRefs = (search: RpbSearch) => {
  const refs: NodeRef[] = [];

  if (search.outlineNodeId) {
    refs.push({
      id: search.outlineNodeId,
      nodeType: 'vae_node',
    });
  }

  if (search.topicId) {
    refs.push({
      id: search.topicId,
      nodeType: 'topic',
    });
  }

  if (search.topicNormId) {
    refs.push({
      id: search.topicNormId,
      nodeType: 'topic_norm',
    });
  }

  if (search.satzId) {
    refs.push({
      id: search.satzId,
      nodeType: 'satz',
    });
  }

  if (search.rechtsmethodikSatzId) {
    refs.push({
      id: search.rechtsmethodikSatzId,
      nodeType: 'satz',
    });
  }

  if (search.previewDocumentId) {
    refs.push({
      id: search.previewDocumentId,
      nodeType: 'dokument',
    });
  }

  if (
    search.participationSubtopicId &&
    search.participationSubtopicId !== RPB_PARTICIPATION_SONSTIGE_SUBTOPIC_ID
  ) {
    refs.push({
      id: search.participationSubtopicId,
      nodeType: 'subtopic',
    });
  }

  if (
    search.feedbackTargetId &&
    isRpbFeedbackTargetNodeType(search.feedbackTargetType)
  ) {
    refs.push({
      id: search.feedbackTargetId,
      nodeType: search.feedbackTargetType,
    });
  }

  return refs;
};

const getFirstParentRefByType = (
  summary: NodeSummary | null | undefined,
  nodeType: NodeTypeLiteral,
) => {
  return summary?.parents.find(
    (parent): parent is NodeRef => parent.nodeType === nodeType,
  );
};

const getRechtsmethodikScopedRefs = (
  index: Awaited<ReturnType<typeof ensureProjectGraphReady>>,
  search: RpbSearch,
) => {
  if (
    !search.rechtsmethodikSatzId ||
    !hasNode(index, search.rechtsmethodikSatzId)
  ) {
    return [];
  }

  const satzSummary = getNode(index, search.rechtsmethodikSatzId);
  const absatzRef = getFirstParentRefByType(satzSummary, 'absatz');
  const normSummary = absatzRef ? getNode(index, absatzRef.id) : undefined;
  const normRef = getFirstParentRefByType(normSummary, 'norm');
  const gesetzSummary = normRef ? getNode(index, normRef.id) : undefined;
  const gesetzRef = getFirstParentRefByType(gesetzSummary, 'gesetz');
  const descendantRefs = getDescendantNodeRefs(
    index,
    search.rechtsmethodikSatzId,
  ).filter((nodeRef) =>
    RECHTSMETHODIK_PRELOAD_NODE_TYPES.has(nodeRef.nodeType),
  );

  return dedupeNodeRefs([
    {
      id: search.rechtsmethodikSatzId,
      nodeType: 'satz',
    },
    ...(absatzRef ? [absatzRef] : []),
    ...(normRef ? [normRef] : []),
    ...(gesetzRef ? [gesetzRef] : []),
    ...descendantRefs,
  ]);
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

type RpbFeedbackTargetRef = NodeRefByType<RpbFeedbackTargetNodeType>;

const isRpbFeedbackTargetRef = (
  nodeRef: NodeRef,
): nodeRef is RpbFeedbackTargetRef => {
  return isRpbFeedbackTargetNodeType(nodeRef.nodeType);
};

export const collectRpbFeedbackPreloadRefs = (
  index: ProjectNodeIndex,
  targetRefs: ReadonlyArray<RpbFeedbackTargetRef>,
) => {
  return dedupeNodeRefs(
    targetRefs.flatMap((targetRef) =>
      getFeedbackRefsForTarget(index, targetRef),
    ),
  );
};

export const collectRpbPreloadRefs = (
  index: Awaited<ReturnType<typeof ensureProjectGraphReady>>,
  search: RpbSearch,
) => {
  const baseRefs = dedupeNodeRefs([
    ...getProjectWideRpbRefs(index),
    ...getTopicScopedRpbRefs(index, search.topicId),
    ...getTopicNormScopedRpbRefs(index, search.topicNormId),
    ...getSatzBewertungScopedRpbRefs(index, search.satzId),
    ...getParticipationSubtopicScopedRpbRefs(
      index,
      search.topicId,
      search.participationSubtopicId,
    ),
    ...getSearchScopedRpbRefs(search),
    ...getRechtsmethodikScopedRefs(index, search),
  ]);

  return dedupeNodeRefs([
    ...baseRefs,
    ...collectRpbFeedbackPreloadRefs(
      index,
      baseRefs.filter(isRpbFeedbackTargetRef),
    ),
  ]);
};

export const preloadRpbRouteData = async (
  db: ExaminationDb,
  search: RpbSearch,
) => {
  const index = await ensureProjectGraphReady(db.nodesCollection, async () => {
    await db.nodesCollection.preload();
    return Array.from(db.nodesCollection.state.values());
  });
  const nodeRefs = collectRpbPreloadRefs(index, search);

  await preloadNodeRefs(db, nodeRefs);
};
