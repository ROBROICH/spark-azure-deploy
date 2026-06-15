import { isHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';
import {
  createHandledMutationError,
  showMutationErrorToast,
} from '@/integrations/api-clients/mutationErrorToast';
import * as Sentry from '@sentry/react';

import {
  createPacedMutations,
  debounceStrategy,
  type MutationFn,
} from '@tanstack/react-db';
import { omit } from 'es-toolkit';
import i18n from 'i18next';
import type { getNodePayloadsCollection } from '../collections/nodePayloads.collection';
import type { getNodeSummariesCollection } from '../collections/nodeSummaries.collection';
import { toCompositeKey } from '../compositeKey';
import type {
  InsertByType,
  InsertNodeAction,
  NodePayload,
  NodePayloadByType,
  NodeRef,
  NodeTypeLiteral,
  UpdateByType,
  UpdateNodeAction,
} from '../types';
import {
  syncDeletedSummaries,
  syncInsertedSummaries,
  syncUpdatedSummaries,
} from './nodeSummarySync';
import { persistNodeChanges } from './persistNodeChanges';

function toInsertNodeAction<T extends NodeTypeLiteral>(
  node: NodePayloadByType<T>,
): InsertByType<T> {
  const {
    node_type,
    id,
    compositeKey: _compositeKey,
    project_id: _projectId,
    created_at: _createdAt,
    updated_at: _updatedAt,
    is_deleted: _isDeleted,
    ...payload
  } = node;

  // @ts-expect-error -- rest-spread payload loses the generic node_type discriminant so TS cannot narrow UpdateByType<T>
  return {
    node_type,
    id,
    payload,
  };
}

function toUpdateNodeAction<T extends NodeTypeLiteral>(
  original: NodePayloadByType<T> | {},
  changes: Partial<NodePayloadByType<T>>,
): UpdateByType<T> {
  if (!('id' in original)) {
    throw new Error("Can't happen");
  }

  // @ts-expect-error -- rest-spread payload loses the generic node_type discriminant so TS cannot narrow UpdateByType<T>
  return {
    node_type: original.node_type,
    id: original.id,
    payload: omit(changes, [
      'node_type',
      'project_id',
      'created_at',
      'updated_at',
      'is_deleted',
    ]),
  };
}

/**
 * Combines inserts updates and deletes together into a single request
 * so they can all be applied with a single backend transaction.
 */
const bulkUpdate =
  (
    projectId: string,
    projectVersion: number,
    payloadsCollection: ReturnType<typeof getNodePayloadsCollection>,
    nodesCollection: ReturnType<typeof getNodeSummariesCollection>,
  ): MutationFn<NodePayloadByType> =>
  async ({ transaction }) => {
    const inserts: InsertNodeAction[] = [];
    const updates: UpdateNodeAction[] = [];
    const deletes: NodeRef[] = [];

    for (const mutation of transaction.mutations) {
      switch (mutation.type) {
        case 'insert': {
          inserts.push(toInsertNodeAction(mutation.modified));
          break;
        }
        case 'update': {
          updates.push(toUpdateNodeAction(mutation.original, mutation.changes));
          break;
        }
        case 'delete': {
          deletes.push({
            node_type: mutation.modified.node_type,
            id: mutation.modified.id,
          });
          break;
        }
      }
    }

    if (inserts.length === 0 && updates.length === 0 && deletes.length === 0) {
      return;
    }

    try {
      const data = await persistNodeChanges({
        projectId,
        projectVersion,
        inserts,
        updates,
        deletes,
      });

      payloadsCollection.utils.writeBatch(() => {
        for (const inserted of data.inserted) {
          payloadsCollection.utils.writeInsert({
            ...inserted,
            compositeKey: toCompositeKey(inserted),
          } as NodePayload);
        }
        for (const updated of data.updated) {
          payloadsCollection.utils.writeUpsert({
            ...updated,
            compositeKey: toCompositeKey(updated),
          } as NodePayload);
        }
        payloadsCollection.utils.writeDelete(
          data.deleted.map((deleted) => toCompositeKey(deleted)),
        );
      });

      syncInsertedSummaries(nodesCollection, data.inserted);
      syncUpdatedSummaries(nodesCollection, data.updated);
      syncDeletedSummaries(nodesCollection, data.deleted);
    } catch (error) {
      handlePersistNodeChangesFailure(error);
    }
  };

export function handlePersistNodeChangesFailure(error: unknown): never {
  if (isHandledProjectVersionConflictError(error)) {
    throw error;
  }

  Sentry.captureException(error);
  showMutationErrorToast({
    error,
    fallbackMessage: i18n.t('nodeAction.updateFailed', { ns: 'shared' }),
  });
  throw createHandledMutationError('Failed to update examination node', error);
}

/**
 * Creates a paced mutation helper for examination payload edits.
 * Uses debounce strategy so rapid edits are batched before persisting.
 */
export function createTransactionHelper(
  projectId: string,
  projectVersion: number,
  payloadsCollection: ReturnType<typeof getNodePayloadsCollection>,
  nodesCollection: ReturnType<typeof getNodeSummariesCollection>,
) {
  return createPacedMutations<
    (collection: ReturnType<typeof getNodePayloadsCollection>) => void,
    NodePayloadByType
  >({
    onMutate: (callback) => {
      callback(payloadsCollection);
    },
    mutationFn: bulkUpdate(
      projectId,
      projectVersion,
      payloadsCollection,
      nodesCollection,
    ),
    strategy: debounceStrategy({ wait: 300 }),
  });
}
