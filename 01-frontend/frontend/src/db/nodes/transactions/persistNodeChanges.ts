import {
  v1ExaminationServiceUpdateNodes as updateExamNodes,
  v1FeedbackUpdateNodes as updateFeedbackNodes,
  v1ObjectionsManagementServiceUpdateNodes as updateOmsNodes,
  v1ProjectLogicServiceUpdateNodes as updatePlsNodes,
  v1AdministrativeFileDraftUpdateNodes as updateVaeNodes,
} from '@/api-clients/backend';
import {
  EXAMINATION_NODE_TYPE_LITERALS,
  FEEDBACK_NODE_TYPE_LITERALS,
  OMS_NODE_TYPE_LITERALS,
  PLS_NODE_TYPE_LITERALS,
  VAE_NODE_TYPE_LITERALS,
} from '../nodeTypeLabels';
import type {
  ExamNodeRef,
  FeedbackNodeRef,
  InsertNodeAction,
  NodePayloadByType,
  NodeRef,
  NodeTypeLiteral,
  OmsNodeRef,
  PlsNodeRef,
  UpdateNodeAction,
  VaeNodeRef,
} from '../types';

type NodeChanges = {
  deletes: NodeRef[];
  inserts: InsertNodeAction[];
  updates: UpdateNodeAction[];
};

type PersistNodeChangesInput = NodeChanges & {
  projectId: string;
  projectVersion: number;
};

export type PersistedNodeChanges = {
  deleted: NodeRef[];
  inserted: Omit<NodePayloadByType, 'compositeKey'>[];
  updated: Omit<NodePayloadByType, 'compositeKey'>[];
};

type ProjectVersionQuery = { projectVersion: number };

type PersistedNodeChangeResult = {
  data?: {
    deleted?: PersistedNodeChanges['deleted'];
    inserted?: (PersistedNodeChanges['inserted'][number] | null)[];
    updated?: (PersistedNodeChanges['updated'][number] | null)[];
  };
} | null;

type CompletedPersistedNodeChangeResult =
  NonNullable<PersistedNodeChangeResult> & {
    data: NonNullable<NonNullable<PersistedNodeChangeResult>['data']>;
  };

const isExamNodeType = <T extends { nodeType: NodeTypeLiteral }>(
  node: T,
): node is Extract<T, { nodeType: ExamNodeRef['nodeType'] }> =>
  EXAMINATION_NODE_TYPE_LITERALS.includes(
    node.nodeType as ExamNodeRef['nodeType'],
  );

const isPlsNodeType = <T extends { nodeType: NodeTypeLiteral }>(
  node: T,
): node is Extract<T, { nodeType: PlsNodeRef['nodeType'] }> =>
  PLS_NODE_TYPE_LITERALS.includes(node.nodeType as PlsNodeRef['nodeType']);

const isFeedbackNodeType = <T extends { nodeType: NodeTypeLiteral }>(
  node: T,
): node is Extract<T, { nodeType: FeedbackNodeRef['nodeType'] }> =>
  FEEDBACK_NODE_TYPE_LITERALS.includes(
    node.nodeType as FeedbackNodeRef['nodeType'],
  );

const isOmsNodeType = <T extends { nodeType: NodeTypeLiteral }>(
  node: T,
): node is Extract<T, { nodeType: OmsNodeRef['nodeType'] }> =>
  OMS_NODE_TYPE_LITERALS.includes(node.nodeType as OmsNodeRef['nodeType']);

const isVaeNodeType = <T extends { nodeType: NodeTypeLiteral }>(
  node: T,
): node is Extract<T, { nodeType: VaeNodeRef['nodeType'] }> =>
  VAE_NODE_TYPE_LITERALS.includes(node.nodeType as VaeNodeRef['nodeType']);

const hasPendingNodeChanges = (changes: NodeChanges) =>
  Object.values(changes).flat().length > 0;

const isPersistableNodeType = (node: { nodeType: NodeTypeLiteral }) =>
  isExamNodeType(node) ||
  isFeedbackNodeType(node) ||
  isPlsNodeType(node) ||
  isOmsNodeType(node) ||
  isVaeNodeType(node);

const getUnsupportedNodeTypes = (changes: NodeChanges) => {
  const unsupportedNodeTypes = new Set<NodeTypeLiteral>();

  for (const node of [
    ...changes.inserts,
    ...changes.updates,
    ...changes.deletes,
  ]) {
    if (!isPersistableNodeType(node)) {
      unsupportedNodeTypes.add(node.nodeType);
    }
  }

  return Array.from(unsupportedNodeTypes).sort();
};

const splitNodeChanges = (changes: NodeChanges) => ({
  examUpdates: {
    inserts: changes.inserts.filter(isExamNodeType),
    updates: changes.updates.filter(isExamNodeType),
    deletes: changes.deletes.filter(isExamNodeType),
  },
  feedbackUpdates: {
    inserts: changes.inserts.filter(isFeedbackNodeType),
    updates: changes.updates.filter(isFeedbackNodeType),
    deletes: changes.deletes.filter(isFeedbackNodeType),
  },
  plsUpdates: {
    inserts: changes.inserts.filter(isPlsNodeType),
    updates: changes.updates.filter(isPlsNodeType),
    deletes: changes.deletes.filter(isPlsNodeType),
  },
  omsUpdates: {
    inserts: changes.inserts.filter(isOmsNodeType),
    updates: changes.updates.filter(isOmsNodeType),
    deletes: changes.deletes.filter(isOmsNodeType),
  },
  vaeUpdates: {
    inserts: changes.inserts.filter(isVaeNodeType),
    updates: changes.updates.filter(isVaeNodeType),
    deletes: changes.deletes.filter(isVaeNodeType),
  },
});

/**
 * Sends each already-split node change group to the backend that owns its node type.
 *
 * @param projectId Project whose nodes are being persisted.
 * @param query Optional active project version query.
 * @param changes Mixed node changes collected from the local transaction.
 * @returns Backend update results in the same order as the routed service calls.
 */
const persistSplitNodeChanges = (
  projectId: string,
  query: ProjectVersionQuery,
  changes: NodeChanges,
) => {
  const { plsUpdates, examUpdates, feedbackUpdates, omsUpdates, vaeUpdates } =
    splitNodeChanges({
      inserts: changes.inserts,
      updates: changes.updates,
      deletes: changes.deletes,
    });

  return Promise.all([
    hasPendingNodeChanges(plsUpdates)
      ? updatePlsNodes({
          path: { projectId: projectId },
          query,
          body: plsUpdates,
          throwOnError: true,
        })
      : null,
    hasPendingNodeChanges(examUpdates)
      ? updateExamNodes({
          path: { projectId: projectId },
          query,
          body: examUpdates,
          throwOnError: true,
        })
      : null,
    hasPendingNodeChanges(feedbackUpdates)
      ? updateFeedbackNodes({
          path: { projectId: projectId },
          query,
          body: feedbackUpdates,
          throwOnError: true,
        })
      : null,
    hasPendingNodeChanges(omsUpdates)
      ? updateOmsNodes({
          path: { projectId: projectId },
          query,
          body: omsUpdates,
          throwOnError: true,
        })
      : null,
    hasPendingNodeChanges(vaeUpdates)
      ? updateVaeNodes({
          path: { projectId: projectId },
          query,
          body: vaeUpdates,
          throwOnError: true,
        })
      : null,
  ]);
};

const mergePersistedNodeResults = (
  results: ReadonlyArray<PersistedNodeChangeResult>,
): PersistedNodeChanges => {
  const completedResults = results.filter(
    (result): result is CompletedPersistedNodeChangeResult =>
      result?.data !== undefined,
  );

  return {
    inserted: completedResults.flatMap((result) =>
      (result.data.inserted ?? []).filter(
        (node): node is PersistedNodeChanges['inserted'][number] =>
          node !== null,
      ),
    ),
    updated: completedResults.flatMap((result) =>
      (result.data.updated ?? []).filter(
        (node): node is PersistedNodeChanges['updated'][number] =>
          node !== null,
      ),
    ),
    deleted: completedResults.flatMap((result) => result.data.deleted ?? []),
  };
};

/**
 * Persists mixed node changes by routing each node type to its owning backend.
 */
export const persistNodeChanges = async (
  input: PersistNodeChangesInput,
): Promise<PersistedNodeChanges> => {
  const { projectId, projectVersion, inserts, updates, deletes } = input;
  const changes = { inserts, updates, deletes };
  const unsupportedNodeTypes = getUnsupportedNodeTypes(changes);

  if (unsupportedNodeTypes.length > 0) {
    throw new Error(
      `Unsupported node mutation type(s): ${unsupportedNodeTypes.join(', ')}`,
    );
  }

  const query = { projectVersion: projectVersion };
  const results = await persistSplitNodeChanges(projectId, query, changes);

  return mergePersistedNodeResults(results);
};
