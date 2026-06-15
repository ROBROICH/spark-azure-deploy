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
      if (draft.node_type !== node.node_type) {
        return;
      }
      updater(draft as NodePayloadByType<T>);
    });
  };

  const insert = <T extends InsertNodeAction>(action: T) => {
    const id = action.id ?? crypto.randomUUID();
    const nodeRef = { id, node_type: action.node_type } as const;
    const now = new Date().toISOString();

    const optimisticPayload = {
      node_type: action.node_type,
      id,
      compositeKey: toCompositeKey(nodeRef),
      project_id: verfahrenId,
      is_deleted: false,
      created_at: now,
      updated_at: now,
      ...action.payload,
    };

    payloadsCollection.insert(optimisticPayload);
  };

  const remove = <T extends NodeTypeLiteral>(node: NodePayloadByType<T>) => {
    payloadsCollection.delete(node.compositeKey);
  };

  return { transact, update, insert, delete: remove };
}
