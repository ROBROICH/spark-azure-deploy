import { queryOnce } from '@tanstack/db';
import { inArray } from '@tanstack/react-db';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { ExaminationDb } from '@/db/nodes/createExaminationDb';
import {
  getDescendantNodeRefs,
  getDescendantNodeRefsByType,
  hasNode,
  type ProjectNodeIndex,
} from '@/db/nodes/examinationGraphModel';
import { ensureProjectGraphReady } from '@/db/nodes/projectGraphCache';
import { getFeedbackRefsForTarget } from '@/features/feedback/useFeedbackLookup';
import type {
  NodePayload,
  NodePayloadByType,
  NodeRef,
  NodeRefByType,
  NodeSummary,
} from '@/db/nodes/types';
import type { MvpSearch } from './topic-detail-screen/mvp.search';

const TOPIC_DETAIL_PRELOAD_NODE_TYPES = new Set<NodeSummary['node_type']>([
  'dokument',
  'topic',
  'topic_norm',
]);

const dedupeNodeRefs = (nodeRefs: ReadonlyArray<NodeRef>) => {
  const refsByCompositeKey = new Map<string, NodeRef>();

  for (const nodeRef of nodeRefs) {
    refsByCompositeKey.set(toCompositeKey(nodeRef), nodeRef);
  }

  return [...refsByCompositeKey.values()];
};

const ensureMvpGraphReady = async (db: ExaminationDb) => {
  return ensureProjectGraphReady(db.nodesCollection, async () => {
    await db.nodesCollection.preload();
    return Array.from(db.nodesCollection.state.values());
  });
};

const preloadNodeRefs = async (
  db: ExaminationDb,
  nodeRefs: ReadonlyArray<NodeRef>,
) => {
  const refs = dedupeNodeRefs(nodeRefs);

  if (refs.length === 0) {
    return [] satisfies NodePayload[];
  }

  const compositeKeys = toCompositeKey(refs);
  const queryResult = await queryOnce((q) =>
    q
      .from({ payloads: db.payloadsCollection })
      .where((query) => inArray(query.payloads.compositeKey, compositeKeys)),
  );

  return queryResult as NodePayload[];
};

const getNormPayloads = (payloads: ReadonlyArray<NodePayload>) => {
  return payloads.filter(
    (payload): payload is NodePayloadByType<'norm'> =>
      payload.node_type === 'norm',
  );
};

const getFundstellenPayloads = (payloads: ReadonlyArray<NodePayload>) => {
  return payloads.filter(
    (payload): payload is NodePayloadByType<'fundstelle'> =>
      payload.node_type === 'fundstelle',
  );
};

export const collectMvpTopicDetailPreloadRefs = (
  index: Awaited<ReturnType<typeof ensureProjectGraphReady>>,
  topicId: string,
) => {
  if (!hasNode(index, topicId)) {
    return [];
  }

  const topicScopedRefs = getDescendantNodeRefs(index, topicId).filter(
    (nodeRef) => TOPIC_DETAIL_PRELOAD_NODE_TYPES.has(nodeRef.node_type),
  );

  return topicScopedRefs;
};

/** Maps deep-link MVP search params to the exact first-paint refs that can sit outside the topic subtree. */
export const getSearchScopedTopicDetailRefs = (
  topicId: string,
  search: MvpSearch,
) => {
  const refs: NodeRef[] = [
    {
      id: topicId,
      node_type: 'topic',
    },
  ];

  if (search.previewDocumentId) {
    refs.push({
      id: search.previewDocumentId,
      node_type: 'dokument',
    });
  }

  if (search.selectedDocumentId) {
    refs.push({
      id: search.selectedDocumentId,
      node_type: 'dokument',
    });
  }

  if (search.selectedNormId) {
    refs.push({
      id: search.selectedNormId,
      node_type: 'norm',
    });
  }

  if (search.detailDocumentId) {
    refs.push({
      id: search.detailDocumentId,
      node_type: 'topic_norm',
    });
  }

  return refs;
};

/**
 * Resolves route-selected Fundstellen refs, intersecting combined document and
 * norm selections so preload matches the rendered Fundstellen mode.
 */
export const getSearchScopedFundstelleRefs = (
  index: Awaited<ReturnType<typeof ensureProjectGraphReady>>,
  search: MvpSearch,
) => {
  const refs: NodeRef[] = [];

  if (
    search.selectedDocumentId &&
    search.selectedNormId &&
    hasNode(index, search.selectedDocumentId) &&
    hasNode(index, search.selectedNormId)
  ) {
    const normFundstelleIds = new Set(
      getDescendantNodeRefsByType(
        index,
        search.selectedNormId,
        'fundstelle',
      ).map((fundstelleRef) => fundstelleRef.id),
    );

    refs.push(
      ...getDescendantNodeRefsByType(
        index,
        search.selectedDocumentId,
        'fundstelle',
      ).filter((fundstelleRef) => normFundstelleIds.has(fundstelleRef.id)),
    );
  } else {
    if (
      search.selectedDocumentId &&
      hasNode(index, search.selectedDocumentId)
    ) {
      refs.push(
        ...getDescendantNodeRefsByType(
          index,
          search.selectedDocumentId,
          'fundstelle',
        ),
      );
    }

    if (search.selectedNormId && hasNode(index, search.selectedNormId)) {
      refs.push(
        ...getDescendantNodeRefsByType(
          index,
          search.selectedNormId,
          'fundstelle',
        ),
      );
    }
  }

  if (
    search.feedbackTargetId &&
    search.feedbackTargetType === 'fundstelle' &&
    hasNode(index, search.feedbackTargetId)
  ) {
    refs.push({
      id: search.feedbackTargetId,
      node_type: 'fundstelle',
    });
  }

  return dedupeNodeRefs(refs);
};

export const collectMvpFeedbackPreloadRefs = (
  index: ProjectNodeIndex,
  fundstelleRefs: ReadonlyArray<NodeRefByType<'fundstelle'>>,
) => {
  return dedupeNodeRefs(
    fundstelleRefs.flatMap((fundstelleRef) =>
      getFeedbackRefsForTarget(index, fundstelleRef),
    ),
  );
};

const getFundstellenScopedNormRefs = (
  fundstellen: ReadonlyArray<NodePayloadByType<'fundstelle'>>,
  search: MvpSearch,
) => {
  if (!search.selectedDocumentId || search.selectedNormId) {
    return [];
  }

  return fundstellen.map((fundstelle) => ({
    id: fundstelle.norm_id,
    node_type: 'norm' as const,
  }));
};

const getFundstellenScopedDocumentRefs = (
  fundstellen: ReadonlyArray<NodePayloadByType<'fundstelle'>>,
  search: MvpSearch,
) => {
  if (!search.selectedNormId || search.selectedDocumentId) {
    return [];
  }

  return fundstellen.map((fundstelle) => ({
    id: fundstelle.dokument_id,
    node_type: 'dokument' as const,
  }));
};

const getNormGesetzRefs = (norms: ReadonlyArray<NodePayloadByType<'norm'>>) => {
  return dedupeNodeRefs(
    norms.map((norm) => ({
      id: norm.gesetz_id,
      node_type: 'gesetz' as const,
    })),
  );
};

export const preloadMvpTopicRouteData = async (
  db: ExaminationDb,
  topicId: string,
  search: MvpSearch,
) => {
  const index = await ensureMvpGraphReady(db);
  const basePayloads = await preloadNodeRefs(db, [
    ...collectMvpTopicDetailPreloadRefs(index, topicId),
    ...getSearchScopedTopicDetailRefs(topicId, search),
    ...getSearchScopedFundstelleRefs(index, search),
  ]);
  const fundstellen = getFundstellenPayloads(basePayloads);
  const [fundstellenScopedNorms] = await Promise.all([
    preloadNodeRefs(db, getFundstellenScopedNormRefs(fundstellen, search)),
    preloadNodeRefs(db, getFundstellenScopedDocumentRefs(fundstellen, search)),
    preloadNodeRefs(
      db,
      collectMvpFeedbackPreloadRefs(
        index,
        fundstellen.map((fundstelle) => ({
          id: fundstelle.id,
          node_type: 'fundstelle',
        })),
      ),
    ),
  ]);
  const gesetzRefs = getNormGesetzRefs([
    ...getNormPayloads(basePayloads),
    ...getNormPayloads(fundstellenScopedNorms),
  ]);

  await preloadNodeRefs(db, gesetzRefs);
};
