import { v1ExaminationAddLegalBasisNormsToProject as addLegalBasisNormsToProject } from '@/api-clients/backend';
import { toCompositeKey, type CompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType, NodeTypeLiteral } from '@/db/nodes/types';
import type { AvailableNormEntry } from '../../screen-data/useRechtsgrundlageData.helpers';

export type NormSelectionMode = 'add' | 'remove';

export type NormSelectionDraftModes = Partial<
  Record<string, NormSelectionMode>
>;

type SaveNormSelectionChangesArgs = {
  availableNormEntries: AvailableNormEntry[];
  draftModes: NormSelectionDraftModes;
  projectId: string;
  projectVersion: number;
  topicId: string;
  transact: (callback: () => void) => {
    isPersisted: {
      promise: Promise<unknown>;
    };
  };
  update: <T extends NodeTypeLiteral>(
    node: NodePayloadByType<T>,
    updater: (draft: NodePayloadByType<T>) => void,
  ) => void;
  deleteNode: <T extends NodeTypeLiteral>(node: NodePayloadByType<T>) => void;
};

type RemovedTopicNormChange = {
  norm: NodePayloadByType<'norm'> | null;
  topicNorm: NodePayloadByType<'topic_norm'>;
  topicNormCompositeKey: CompositeKey;
};

const buildAddedNormSelections = (
  availableNormEntries: AvailableNormEntry[],
  draftModes: NormSelectionDraftModes,
) => {
  return availableNormEntries.flatMap((normEntry) => {
    if (draftModes[normEntry.selectionKey] !== 'add') {
      return [];
    }

    if (normEntry.topicNorms.length > 0) {
      return [];
    }

    return [normEntry.legalBasis];
  });
};

const buildRemovedTopicNormChanges = (
  availableNormEntries: AvailableNormEntry[],
  draftModes: NormSelectionDraftModes,
) => {
  return availableNormEntries.flatMap((normEntry) => {
    if (
      draftModes[normEntry.selectionKey] !== 'remove' ||
      normEntry.topicNorms.length === 0
    ) {
      return [];
    }

    return normEntry.topicNormLinks.map((link) => ({
      norm: link.norm,
      topicNorm: link.topicNorm,
      topicNormCompositeKey: toCompositeKey(link.topicNorm),
    })) satisfies RemovedTopicNormChange[];
  });
};

const applyRemovedTopicNormChanges = (
  removedTopicNorms: RemovedTopicNormChange[],
  update: SaveNormSelectionChangesArgs['update'],
  deleteNode: SaveNormSelectionChangesArgs['deleteNode'],
) => {
  for (const topicNorm of removedTopicNorms) {
    deleteNode(topicNorm.topicNorm);
    if (!topicNorm.norm) {
      continue;
    }

    update(topicNorm.norm, (draft) => {
      draft.frontendParentIds = draft.frontendParentIds.filter(
        (parentId) => parentId !== topicNorm.topicNormCompositeKey,
      );
    });
  }
};

/**
 * Persists the dialog draft by sending additions through the legal-basis
 * backend endpoint while removals stay in the nodes package.
 */
export async function saveNormSelectionChanges(
  args: SaveNormSelectionChangesArgs,
) {
  const {
    availableNormEntries,
    draftModes,
    projectId,
    projectVersion,
    topicId,
    transact,
    update,
    deleteNode,
  } = args;
  const addedNormSelections = buildAddedNormSelections(
    availableNormEntries,
    draftModes,
  );
  const removedTopicNorms = buildRemovedTopicNormChanges(
    availableNormEntries,
    draftModes,
  );

  if (addedNormSelections.length === 0 && removedTopicNorms.length === 0) {
    return false;
  }

  if (addedNormSelections.length > 0) {
    await addLegalBasisNormsToProject({
      body: {
        topicId: topicId,
        norms: addedNormSelections,
        type: 'pruefung',
      },
      path: {
        projectId: projectId,
      },
      query: {
        projectVersion: projectVersion,
      },
      throwOnError: true,
    });
  }

  if (removedTopicNorms.length === 0) {
    return true;
  }

  const tx = transact(() => {
    applyRemovedTopicNormChanges(removedTopicNorms, update, deleteNode);
  });

  try {
    await tx.isPersisted.promise;
    return true;
  } catch {
    throw new Error('Failed to save norm selection changes');
  }
}
