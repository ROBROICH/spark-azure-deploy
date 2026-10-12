import { toCompositeKey } from '@/db/nodes/compositeKey';
import { createTransactionHelper } from '@/db/nodes/transactions/payloadUpdate.transaction';
import type {
  InsertNodeAction,
  NodeTypeLiteral,
  NodePayloadByType,
} from '@/db/nodes/types';

import { getRouteApi } from '@tanstack/react-router';

const route = getRouteApi('/verfahren/$verfahrenId');

/**
 * Provides node payload helpers. `update`, `insert`, `delete` operate on the
 * collection directly. Wrap them in `transact` to batch multiple operations.
 */
export function useAction() {
  const { db, projectVersion } = route.useLoaderData();
  const { verfahrenId } = route.useParams();
  const { payloadsCollection, nodesCollection } = db;
  const transact = createTransactionHelper(
    verfahrenId,
    projectVersion,
    payloadsCollection,
    nodesCollection,
  );

  const update = <T extends NodeTypeLiteral>(
    node: NodePayloadByType<T>,
    updater: (draft: NodePayloadByType<T>) => void,
  ) => {
    payloadsCollection.update(node.compositeKey, (draft) => {
      if (draft.nodeType !== node.nodeType) {
        return;
      }
      updater(draft as NodePayloadByType<T>);
    });
  };

  const insert = <T extends InsertNodeAction>(action: T) => {
    const id = action.id ?? crypto.randomUUID();
    const nodeRef = { id, nodeType: action.nodeType } as const;
    const now = new Date().toISOString();

    const optimisticPayload = {
      nodeType: action.nodeType,
      id,
      compositeKey: toCompositeKey(nodeRef),
      projectId: verfahrenId,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      ...action.payload,
    };

    payloadsCollection.insert(optimisticPayload);
  };

  const remove = <T extends NodeTypeLiteral>(node: NodePayloadByType<T>) => {
    payloadsCollection.delete(node.compositeKey);
  };

  return { transact, update, insert, delete: remove };
}
