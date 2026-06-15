import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

import { toCompositeKey, tryFromCompositeKey } from '@/db/nodes/compositeKey';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useLiveNodes } from '@/db/nodes/hooks/useLiveNodes';
import { useLiveTopicNodes } from '@/db/nodes/hooks/useTopicNodes';
import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import { useLiveHasTopicMutationRights } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import type { TreeNode } from '@/features/project/data/document-tree/documentTree.types';
import { useAction } from '@/db/nodes/hooks/useAction';

type FvpTopicAssignmentProviderProps = {
  canMutateProject?: boolean;
  children: ReactNode;
  rows: TreeNode[];
};

type DokumentRef = NodeRefByType<'dokument'>;

/**
 * Walks one filtered tree branch and records every document row id as a file id.
 * Folder children recurse depth-first until the full visible subtree is covered.
 */
const collectDocumentFileIdsFromNode = (
  node: TreeNode,
  fileIds: Set<string>,
) => {
  if (node.kind === 'document') {
    fileIds.add(node.id);
    return;
  }

  for (const child of node.children) {
    collectDocumentFileIdsFromNode(child, fileIds);
  }
};

const collectDocumentFileIds = (rows: TreeNode[]) => {
  const fileIds = new Set<string>();

  for (const row of rows) {
    collectDocumentFileIdsFromNode(row, fileIds);
  }

  return fileIds;
};

const isDokumentRef = (
  ref: ReturnType<ReturnType<typeof useGraph>['getDescendants']>[number],
): ref is DokumentRef => ref.node_type === 'dokument';

const collectVisibleDokumentRefsForFile = (
  fileId: string,
  getDescendants: ReturnType<typeof useGraph>['getDescendants'],
) => getDescendants(fileId).filter(isDokumentRef);

const collectVisibleDokumentRefs = (
  visibleFileIds: ReadonlySet<string>,
  getDescendants: ReturnType<typeof useGraph>['getDescendants'],
) => {
  const refsByKey = new Map<string, DokumentRef>();

  for (const fileId of visibleFileIds) {
    for (const ref of collectVisibleDokumentRefsForFile(
      fileId,
      getDescendants,
    )) {
      refsByKey.set(`${ref.node_type}:${ref.id}`, ref);
    }
  }

  return [...refsByKey.values()];
};

const getSelectedTopicIds = (linkedDocument?: NodePayloadByType<'dokument'>) =>
  linkedDocument?.frontend_parent_ids.flatMap((parentId) => {
    const parentRef = tryFromCompositeKey(parentId);

    return parentRef?.node_type === 'topic' ? [parentRef.id] : [];
  }) ?? [];

const createTopicOptions = (topics: NodePayloadByType<'topic'>[]) =>
  topics.map((topic) => ({
    id: topic.id,
    label: topic.name,
  }));

/**
 * The node graph retains outdated and soft-deleted `dokument` summaries, so one
 * `dms_file_id` can resolve to several payloads across project versions, and the
 * payload query does not filter them. Topic links must only ever be written to
 * the live payload, so stale/deleted payloads are excluded before linking.
 */
const isActiveDokumentPayload = (payload: NodePayloadByType<'dokument'>) =>
  !payload.is_deleted && !payload.is_outdated;

const createLinkedDocumentByFileId = (
  dokumentPayloads: NodePayloadByType<'dokument'>[],
  visibleFileIds: ReadonlySet<string>,
) => {
  const nextMap = new Map<string, NodePayloadByType<'dokument'>>();

  for (const payload of dokumentPayloads) {
    if (!isActiveDokumentPayload(payload)) {
      continue;
    }

    if (!payload.dms_file_id || !visibleFileIds.has(payload.dms_file_id)) {
      continue;
    }

    if (!nextMap.has(payload.dms_file_id)) {
      nextMap.set(payload.dms_file_id, payload);
    }
  }

  return nextMap;
};

const createSelectedTopicIdsByFileId = (
  linkedDocumentByFileId: ReadonlyMap<string, NodePayloadByType<'dokument'>>,
) => {
  const nextMap = new Map<string, string[]>();

  for (const [fileId, linkedDocument] of linkedDocumentByFileId) {
    nextMap.set(fileId, getSelectedTopicIds(linkedDocument));
  }

  return nextMap;
};

const createLinkedDocumentByFileIdWhenReady = (
  dokumentPayloads: NodePayloadByType<'dokument'>[],
  visibleFileIds: ReadonlySet<string>,
  isLoadingDokumentPayloads: boolean,
) =>
  isLoadingDokumentPayloads
    ? new Map<string, NodePayloadByType<'dokument'>>()
    : createLinkedDocumentByFileId(dokumentPayloads, visibleFileIds);

const replaceTopicParentIds = (
  linkedDocument: NodePayloadByType<'dokument'>,
  topicIds: string[],
) => {
  const nonTopicParentIds = linkedDocument.frontend_parent_ids.filter(
    (parentId) => tryFromCompositeKey(parentId)?.node_type !== 'topic',
  );

  linkedDocument.frontend_parent_ids =
    topicIds.length === 0
      ? nonTopicParentIds
      : [
          ...nonTopicParentIds,
          ...topicIds.map((topicId) =>
            toCompositeKey({ id: topicId, node_type: 'topic' }),
          ),
        ];
};

/**
 * Returns the topics whose document link actually changes between the current
 * and next selection: the union of removed and added topic ids. A reassignment
 * requires mutation rights on every affected topic, while topics that stay in
 * both selections are untouched and do not need a permission check.
 */
const getAffectedTopicIds = (
  currentTopicIds: string[],
  nextTopicIds: string[],
) => {
  const currentSet = new Set(currentTopicIds);
  const nextSet = new Set(nextTopicIds);

  return [
    ...currentTopicIds.filter((topicId) => !nextSet.has(topicId)),
    ...nextTopicIds.filter((topicId) => !currentSet.has(topicId)),
  ];
};

/**
 * A topic reassignment is permitted only when the user has mutation rights for
 * every topic whose document link is added or removed.
 */
const canReassignTopics = (
  linkedDocument: NodePayloadByType<'dokument'>,
  nextTopicIds: string[],
  hasTopicMutationRights: (topicId: string | null) => boolean,
) =>
  getAffectedTopicIds(getSelectedTopicIds(linkedDocument), nextTopicIds).every(
    (topicId) => hasTopicMutationRights(topicId),
  );

const useFvpTopicAssignmentData = (rows: TreeNode[]) => {
  const { data: topics, isLoading: isLoadingTopics } = useLiveTopicNodes();
  const { getDescendants } = useGraph();
  const visibleFileIds = useMemo(() => collectDocumentFileIds(rows), [rows]);
  const dokumentRefs = useMemo(
    () => collectVisibleDokumentRefs(visibleFileIds, getDescendants),
    [getDescendants, visibleFileIds],
  );
  const { data: dokumentPayloads, isLoading: isLoadingDokumentPayloads } =
    useLiveNodes(dokumentRefs);
  const isLoading = isLoadingTopics || isLoadingDokumentPayloads;
  const topicOptions = useMemo(
    () => (isLoadingTopics ? [] : createTopicOptions(topics)),
    [isLoadingTopics, topics],
  );
  const linkedDocumentByFileId = useMemo(
    () =>
      createLinkedDocumentByFileIdWhenReady(
        dokumentPayloads,
        visibleFileIds,
        isLoadingDokumentPayloads,
      ),
    [dokumentPayloads, isLoadingDokumentPayloads, visibleFileIds],
  );
  const selectedTopicIdsByFileId = useMemo(
    () => createSelectedTopicIdsByFileId(linkedDocumentByFileId),
    [linkedDocumentByFileId],
  );

  return {
    isLoading,
    linkedDocumentByFileId,
    selectedTopicIdsByFileId,
    topicOptions,
  };
};

const useFvpTopicAssignmentContextLogic = (
  props: Omit<FvpTopicAssignmentProviderProps, 'children'>,
) => {
  const { canMutateProject = true, rows } = props;
  const { transact, update } = useAction();
  const hasTopicMutationRights = useLiveHasTopicMutationRights();
  const {
    isLoading,
    linkedDocumentByFileId,
    selectedTopicIdsByFileId,
    topicOptions,
  } = useFvpTopicAssignmentData(rows);

  const commitTopicIds = useCallback(
    (dmsFileId: string, topicIds: string[]) => {
      if (!canMutateProject || isLoading) {
        return;
      }

      const linkedDocument = linkedDocumentByFileId.get(dmsFileId);

      if (!linkedDocument) {
        return;
      }

      // Reassigning topic graph links mutates a topic-owned descendant, so fail
      // closed unless the user can mutate every topic whose link changes.
      if (
        !canReassignTopics(linkedDocument, topicIds, hasTopicMutationRights)
      ) {
        return;
      }

      startTransition(() => {
        const tx = transact(() => {
          update(linkedDocument, (draft) =>
            replaceTopicParentIds(draft, topicIds),
          );
        });

        // The transaction helper already shows user feedback and reverts on failure.
        void tx.isPersisted.promise.catch(() => undefined);
      });
    },
    [
      canMutateProject,
      hasTopicMutationRights,
      isLoading,
      linkedDocumentByFileId,
      transact,
      update,
    ],
  );

  return useMemo(
    () => ({
      commitTopicIds,
      isLoading,
      linkedDocumentByFileId,
      selectedTopicIdsByFileId,
      topicOptions,
    }),
    [
      commitTopicIds,
      isLoading,
      linkedDocumentByFileId,
      selectedTopicIdsByFileId,
      topicOptions,
    ],
  );
};

type FvpTopicAssignmentContextValue = ReturnType<
  typeof useFvpTopicAssignmentContextLogic
>;

const FvpTopicAssignmentContext =
  createContext<FvpTopicAssignmentContextValue | null>(null);

const useFvpTopicAssignmentContext = () => {
  const context = useContext(FvpTopicAssignmentContext);

  if (context === null) {
    throw new Error(
      'useFvpTopicAssignmentContext must be used within FvpTopicAssignmentProvider',
    );
  }

  return context;
};

export const useFvpTopicAssignment = (dmsFileId: string) => {
  const context = useFvpTopicAssignmentContext();
  const linkedDocument = context.linkedDocumentByFileId.get(dmsFileId);

  return {
    commitTopicIds: context.commitTopicIds,
    hasLinkedDocument: !context.isLoading && linkedDocument !== undefined,
    isLoading: context.isLoading,
    selectedTopicIds: context.selectedTopicIdsByFileId.get(dmsFileId) ?? [],
    topicOptions: context.topicOptions,
  };
};

export const FvpTopicAssignmentProvider = (
  props: FvpTopicAssignmentProviderProps,
) => {
  const { canMutateProject = true, children, rows } = props;
  const value = useFvpTopicAssignmentContextLogic({ canMutateProject, rows });

  return (
    <FvpTopicAssignmentContext.Provider value={value}>
      {children}
    </FvpTopicAssignmentContext.Provider>
  );
};
