import { toCompositeKey, type CompositeKey } from '@/db/nodes/compositeKey';
import type {
  InsertByType,
  InsertNodeAction,
  NodePayloadByType,
  NodeTypeLiteral,
} from '@/db/nodes/types';
import type { AvailableNormEntry } from '../../screen-data/useRechtsgrundlageData.helpers';

export type NormSelectionMode = 'add' | 'remove';

export type NormSelectionDraftModes = Partial<
  Record<string, NormSelectionMode>
>;

type SaveNormSelectionChangesArgs = {
  availableNormEntries: AvailableNormEntry[];
  draftModes: NormSelectionDraftModes;
  topicId: string;
  transact: (callback: () => void) => {
    isPersisted: {
      promise: Promise<unknown>;
    };
  };
  insert: (payload: InsertNodeAction) => void;
  update: <T extends NodeTypeLiteral>(
    node: NodePayloadByType<T>,
    updater: (draft: NodePayloadByType<T>) => void,
  ) => void;
  deleteNode: <T extends NodeTypeLiteral>(node: NodePayloadByType<T>) => void;
};

type TopicNormInsertPayload = InsertByType<'topic_norm'>['payload'];

type InsertedTopicNormChange = {
  norm: NodePayloadByType<'norm'>;
  topicNormCompositeKey: CompositeKey;
  insertAction: InsertByType<'topic_norm'>;
};

type RemovedTopicNormChange = {
  norm: NodePayloadByType<'norm'>;
  topicNorm: NodePayloadByType<'topic_norm'>;
  topicNormCompositeKey: CompositeKey;
};

const buildInsertedTopicNormChanges = (
  availableNormEntries: AvailableNormEntry[],
  draftModes: NormSelectionDraftModes,
  topicId: string,
) => {
  const topicRef = { id: topicId, node_type: 'topic' as const };

  return availableNormEntries.flatMap((normEntry) => {
    if (draftModes[normEntry.norm.id] !== 'add' || !normEntry.gesetz) {
      return [];
    }

    if (normEntry.topicNorms.length > 0) {
      return [];
    }

    const topicNormRef = {
      id: crypto.randomUUID(),
      node_type: 'topic_norm' as const,
    };
    const topicNormCompositeKey = toCompositeKey(topicNormRef);
    const payload: TopicNormInsertPayload = {
      topic_id: topicId,
      type: 'pruefung',
      mvp_status: 'unchecked',
      satz_statuses: {},
      frontend_parent_ids: toCompositeKey([topicRef]),
      update_type: 'manual',
      jurabk: normEntry.gesetz.jurabk,
      paragraph_nr: normEntry.norm.paragraph_nr,
    };

    return [
      {
        norm: normEntry.norm,
        topicNormCompositeKey,
        insertAction: {
          node_type: 'topic_norm' as const,
          id: topicNormRef.id,
          payload,
        },
      },
    ] satisfies InsertedTopicNormChange[];
  });
};

const buildRemovedTopicNormChanges = (
  availableNormEntries: AvailableNormEntry[],
  draftModes: NormSelectionDraftModes,
) => {
  return availableNormEntries.flatMap((normEntry) => {
    if (
      draftModes[normEntry.norm.id] !== 'remove' ||
      normEntry.topicNorms.length === 0
    ) {
      return [];
    }

    return normEntry.topicNorms.map((topicNorm) => {
      const topicNormCompositeKey = toCompositeKey(topicNorm);

      return {
        norm: normEntry.norm,
        topicNorm,
        topicNormCompositeKey,
      };
    }) satisfies RemovedTopicNormChange[];
  });
};

const applySelectionChanges = (
  insertedTopicNorms: InsertedTopicNormChange[],
  removedTopicNorms: RemovedTopicNormChange[],
  insert: (payload: InsertNodeAction) => void,
  update: SaveNormSelectionChangesArgs['update'],
  deleteNode: SaveNormSelectionChangesArgs['deleteNode'],
) => {
  for (const topicNorm of insertedTopicNorms) {
    insert(topicNorm.insertAction);
    update(topicNorm.norm, (draft) => {
      if (draft.frontend_parent_ids.includes(topicNorm.topicNormCompositeKey)) {
        return;
      }

      draft.frontend_parent_ids = [
        ...draft.frontend_parent_ids,
        topicNorm.topicNormCompositeKey,
      ];
    });
  }

  for (const topicNorm of removedTopicNorms) {
    deleteNode(topicNorm.topicNorm);
    update(topicNorm.norm, (draft) => {
      draft.frontend_parent_ids = draft.frontend_parent_ids.filter(
        (parentId) => parentId !== topicNorm.topicNormCompositeKey,
      );
    });
  }
};

/**
 * Persists the dialog draft by executing the add and remove modes separately.
 *
 * `add` creates a new `topic_norm` child of the active topic and links the
 * source norm back to it through `norm.frontend_parent_ids`.
 *
 * `remove` deletes the existing `topic_norm` node and removes that
 * `topic_norm` reference from the source norm's `frontend_parent_ids`.
 */
export async function saveNormSelectionChanges(
  args: SaveNormSelectionChangesArgs,
) {
  const {
    availableNormEntries,
    draftModes,
    topicId,
    transact,
    insert,
    update,
    deleteNode,
  } = args;
  const insertedTopicNorms = buildInsertedTopicNormChanges(
    availableNormEntries,
    draftModes,
    topicId,
  );
  const removedTopicNorms = buildRemovedTopicNormChanges(
    availableNormEntries,
    draftModes,
  );

  if (insertedTopicNorms.length === 0 && removedTopicNorms.length === 0) {
    return false;
  }

  const tx = transact(() => {
    applySelectionChanges(
      insertedTopicNorms,
      removedTopicNorms,
      insert,
      update,
      deleteNode,
    );
  });

  try {
    await tx.isPersisted.promise;
    return true;
  } catch {
    throw new Error('Failed to save norm selection changes');
  }
}
