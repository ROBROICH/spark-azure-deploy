import type { getNodeSummariesCollection } from '../collections/nodeSummaries.collection';
import { toCompositeKey } from '../compositeKey';
import type { NodeRef } from '../types';
import type { PersistedNodeChanges } from './persistNodeChanges';

type NodeSummaryCollection = ReturnType<typeof getNodeSummariesCollection>;

type NodeSummaryCollectionItem =
  NodeSummaryCollection['state'] extends Map<string, infer T> ? T : never;

type SummarySyncNode = PersistedNodeChanges['inserted'][number];

const hasFrontendParentIds = (
  node: SummarySyncNode,
): node is SummarySyncNode & { frontend_parent_ids: string[] } =>
  'frontend_parent_ids' in node && Array.isArray(node.frontend_parent_ids);

export const syncUpdatedSummaries = (
  nodesCollection: NodeSummaryCollection,
  updatedNodes: PersistedNodeChanges['updated'],
) => {
  const summariesToUpsert = updatedNodes.flatMap((updatedNode) => {
    if (!hasFrontendParentIds(updatedNode)) {
      return [];
    }

    const compositeKey = toCompositeKey(updatedNode);
    const existingSummary = nodesCollection.state.get(compositeKey);

    if (!existingSummary) {
      return [];
    }

    return [
      {
        ...existingSummary,
        frontend_parent_ids: updatedNode.frontend_parent_ids,
      },
    ];
  });

  if (summariesToUpsert.length === 0) {
    return;
  }

  nodesCollection.utils.writeUpsert(summariesToUpsert);
};

export const syncInsertedSummaries = (
  nodesCollection: NodeSummaryCollection,
  insertedNodes: PersistedNodeChanges['inserted'],
) => {
  const summariesToUpsert = insertedNodes.flatMap((insertedNode) => {
    if (!hasFrontendParentIds(insertedNode)) {
      return [];
    }

    return [
      {
        id: insertedNode.id,
        node_type: insertedNode.node_type,
        parents: [],
        frontend_parent_ids: insertedNode.frontend_parent_ids,
        compositeKey: toCompositeKey(insertedNode),
      } as unknown as NodeSummaryCollectionItem,
    ];
  });

  if (summariesToUpsert.length === 0) {
    return;
  }

  nodesCollection.utils.writeUpsert(summariesToUpsert);
};

export const syncDeletedSummaries = (
  nodesCollection: NodeSummaryCollection,
  deletedNodes: NodeRef[],
) => {
  if (deletedNodes.length === 0) {
    return;
  }

  nodesCollection.utils.writeDelete(
    deletedNodes.map((node) => toCompositeKey(node)),
  );
};
