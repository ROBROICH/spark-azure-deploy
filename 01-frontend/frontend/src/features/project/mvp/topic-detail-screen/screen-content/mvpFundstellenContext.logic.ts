import { measureGraphPerf } from '@/db/nodes/graphPerf';
import type { ProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import type { NodeRef } from '@/db/nodes/types';

type FundstelleRef = NodeRef & { node_type: 'fundstelle' };

const createDocumentNormPairKey = (documentId: string, normId: string) => {
  return `${documentId}\u0000${normId}`;
};

const addDocumentNormPairs = (params: {
  documentIds: ReadonlySet<string>;
  documentNormPairs: Set<string>;
  normIds: ReadonlySet<string>;
}) => {
  for (const documentId of params.documentIds) {
    const pairKeys = Array.from(params.normIds, (normId) =>
      createDocumentNormPairKey(documentId, normId),
    );

    pairKeys.forEach((pairKey) => params.documentNormPairs.add(pairKey));
  }
};

/**
 * Recursively caches each node's full ancestor chain so shared document/norm
 * parent paths are walked once while building topic-scoped Fundstellen badges.
 */
const collectAncestorIds = (
  index: ProjectNodeIndex,
  startId: string,
  ancestorIdsByNodeId: Map<string, ReadonlySet<string>>,
  resolvingNodeIds: Set<string>,
): ReadonlySet<string> => {
  const cachedAncestorIds = ancestorIdsByNodeId.get(startId);

  if (cachedAncestorIds) {
    return cachedAncestorIds;
  }

  if (resolvingNodeIds.has(startId)) {
    return new Set<string>();
  }

  resolvingNodeIds.add(startId);

  const ancestorIds = new Set<string>();

  for (const parentId of index.parentIdsByNodeId.get(startId) ?? []) {
    ancestorIds.add(parentId);

    for (const ancestorId of collectAncestorIds(
      index,
      parentId,
      ancestorIdsByNodeId,
      resolvingNodeIds,
    )) {
      ancestorIds.add(ancestorId);
    }
  }

  resolvingNodeIds.delete(startId);
  ancestorIdsByNodeId.set(startId, ancestorIds);

  return ancestorIds;
};

const collectAncestorIdsByType = (
  index: ProjectNodeIndex,
  startId: string,
  nodeType: NodeRef['node_type'],
  ancestorIdsByNodeId: Map<string, ReadonlySet<string>>,
) => {
  const matchingAncestorIds = new Set<string>();
  const ancestorIds = collectAncestorIds(
    index,
    startId,
    ancestorIdsByNodeId,
    new Set(),
  );

  for (const ancestorId of ancestorIds) {
    const ancestor = index.nodeById.get(ancestorId);

    if (ancestor?.node_type === nodeType) {
      matchingAncestorIds.add(ancestor.id);
    }
  }

  return matchingAncestorIds;
};

/**
 * Builds document, norm, and document-norm presence indexes from graph
 * ancestry only, avoiding the expensive full-topic fundstelle payload load.
 */
export const createMvpFundstellenRefIndexes = (
  index: ProjectNodeIndex,
  topicFundstelleRefs: FundstelleRef[],
) => {
  return measureGraphPerf(
    'mvp.fundstellen.refIndexes.build',
    () => {
      const documentIdsWithFundstellen = new Set<string>();
      const documentNormPairs = new Set<string>();
      const normIdsWithFundstellen = new Set<string>();
      const ancestorIdsByNodeId = new Map<string, ReadonlySet<string>>();

      for (const fundstelleRef of topicFundstelleRefs) {
        const documentIds = collectAncestorIdsByType(
          index,
          fundstelleRef.id,
          'dokument',
          ancestorIdsByNodeId,
        );
        const normIds = collectAncestorIdsByType(
          index,
          fundstelleRef.id,
          'norm',
          ancestorIdsByNodeId,
        );

        for (const documentId of documentIds) {
          documentIdsWithFundstellen.add(documentId);
        }

        for (const normId of normIds) {
          normIdsWithFundstellen.add(normId);
        }

        addDocumentNormPairs({ documentIds, documentNormPairs, normIds });
      }

      return {
        documentIdsWithFundstellen,
        documentNormPairs,
        normIdsWithFundstellen,
      };
    },
    { fundstelleRefCount: topicFundstelleRefs.length },
  );
};

export const useMvpFundstellenRefIndexes = (
  index: ProjectNodeIndex,
  topicFundstelleRefs: FundstelleRef[],
) => {
  return createMvpFundstellenRefIndexes(index, topicFundstelleRefs);
};

type CreateMvpFundstellenContextValueParams = {
  documentIdsWithFundstellen: Set<string>;
  documentNormPairs: Set<string>;
  normIdsWithFundstellen: Set<string>;
};

/**
 * Builds the topic-scoped fundstellen presence API from graph refs only.
 *
 * @param params Precomputed ref indexes for the current topic.
 * @returns Stable accessors for document, norm, and combined presence checks.
 */
export const createMvpFundstellenContextValue = (
  params: CreateMvpFundstellenContextValueParams,
) => {
  return {
    documentIdsWithFundstellen: params.documentIdsWithFundstellen,
    normIdsWithFundstellen: params.normIdsWithFundstellen,
    hasAnyFundstellenForDocument: (documentId: string) =>
      params.documentIdsWithFundstellen.has(documentId),
    hasAnyFundstellenForNorm: (normId: string) =>
      params.normIdsWithFundstellen.has(normId),
    hasFundstellenForDocumentAndNorm: (documentId: string, normId: string) =>
      params.documentNormPairs.has(
        createDocumentNormPairKey(documentId, normId),
      ),
  };
};

export type MvpFundstellenContextValue = ReturnType<
  typeof createMvpFundstellenContextValue
>;
