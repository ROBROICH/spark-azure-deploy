import { invariant } from 'es-toolkit/util';

import type { BeschlussDocument, BeschlussNode } from '../data/usecaseApi';
import {
  collectSubtreeIds,
  nextNodeOrder,
  reorderSibling,
} from './beschlussTree';

export type BeschlussNodePatch = {
  title?: string;
  text?: string;
  topic?: string | null;
  is_hidden?: boolean;
  can_add_child?: boolean;
};

export type BeschlussDraftIssue =
  | { code: 'emptyTitle'; nodeId: string }
  | { code: 'unknownTopic'; nodeId: string; title: string; topic: string }
  | { code: 'cannotAddChild'; nodeId: string };

export type BeschlussDraftState = {
  document: BeschlussDocument;
  lastRefusal: BeschlussDraftIssue | null;
};

export type BeschlussDraftAction =
  | { type: 'replace'; document: BeschlussDocument }
  | { type: 'addChild'; parentId: string | null; title: string }
  | { type: 'updateNode'; nodeId: string; patch: BeschlussNodePatch }
  | { type: 'removeNode'; nodeId: string }
  | { type: 'moveSibling'; nodeId: string; direction: 'up' | 'down' };

export const createBeschlussDraftState = (
  document: BeschlussDocument,
): BeschlussDraftState => ({
  document: structuredClone(document),
  lastRefusal: null,
});

const refuse = (
  state: BeschlussDraftState,
  lastRefusal: BeschlussDraftIssue,
): BeschlussDraftState => ({ ...state, lastRefusal });

const withNodes = (
  state: BeschlussDraftState,
  nodes: BeschlussNode[],
): BeschlussDraftState => ({
  document: { nodes },
  lastRefusal: null,
});

const requireNode = (
  nodes: ReadonlyArray<BeschlussNode>,
  nodeId: string,
): BeschlussNode => {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  invariant(node !== undefined, 'Beschluss node id is missing from the draft');
  return node;
};

const createNode = (
  parentId: string | null,
  title: string,
  order: number,
): BeschlussNode => ({
  id: crypto.randomUUID(),
  parent_vae_node_id: parentId,
  title: title.trim(),
  text: '',
  topic: null,
  order,
  is_hidden: false,
  can_add_child: true,
});

const addChild = (
  state: BeschlussDraftState,
  parentId: string | null,
  title: string,
): BeschlussDraftState => {
  if (title.trim().length === 0) {
    return refuse(state, { code: 'emptyTitle', nodeId: parentId ?? '' });
  }

  if (parentId) {
    const parent = requireNode(state.document.nodes, parentId);
    if (!parent.can_add_child) {
      return refuse(state, { code: 'cannotAddChild', nodeId: parentId });
    }
  }

  const order = nextNodeOrder(state.document.nodes);
  return withNodes(state, [
    ...state.document.nodes,
    createNode(parentId, title, order),
  ]);
};

const updateNode = (
  state: BeschlussDraftState,
  nodeId: string,
  patch: BeschlussNodePatch,
): BeschlussDraftState => {
  requireNode(state.document.nodes, nodeId);
  return withNodes(
    state,
    state.document.nodes.map((node) =>
      node.id === nodeId ? { ...node, ...patch } : node,
    ),
  );
};

/**
 * Removes a node and its subtree without changing remaining node orders.
 *
 * @param state Current Beschluss draft.
 * @param nodeId Node whose subtree should be removed.
 * @returns Draft without that subtree.
 */
const removeSubtree = (
  state: BeschlussDraftState,
  nodeId: string,
): BeschlussDraftState => {
  requireNode(state.document.nodes, nodeId);
  const removedIds = collectSubtreeIds(state.document.nodes, nodeId);
  const remaining = state.document.nodes.filter(
    (candidate) => !removedIds.has(candidate.id),
  );

  return withNodes(state, remaining);
};

/**
 * Applies one structural or field edit to the Beschluss template draft.
 *
 * @param state Current draft document and last refusal.
 * @param action Create, update, remove, reorder, or replace.
 * @returns The next draft. Illegal create-below is refused without mutation.
 */
export const beschlussDraftReducer = (
  state: BeschlussDraftState,
  action: BeschlussDraftAction,
): BeschlussDraftState => {
  switch (action.type) {
    case 'replace':
      return createBeschlussDraftState(action.document);
    case 'addChild':
      return addChild(state, action.parentId, action.title);
    case 'updateNode':
      return updateNode(state, action.nodeId, action.patch);
    case 'removeNode':
      return removeSubtree(state, action.nodeId);
    case 'moveSibling':
      return withNodes(
        state,
        reorderSibling(state.document.nodes, action.nodeId, action.direction),
      );
  }
};

export const isBeschlussDraftDirty = (
  draft: BeschlussDocument,
  server: BeschlussDocument,
): boolean => JSON.stringify(draft) !== JSON.stringify(server);

/**
 * Collects client-side save blockers: blank titles and topic names that are
 * not in the current gesetzesgrundlage catalog.
 *
 * @param nodes Draft Beschluss nodes.
 * @param knownTopics Topic names from the current catalog document.
 * @returns Issues that must be resolved before Speichern.
 */
export const collectBeschlussIssues = (
  nodes: ReadonlyArray<BeschlussNode>,
  knownTopics: ReadonlySet<string>,
): BeschlussDraftIssue[] => {
  const issues: BeschlussDraftIssue[] = [];

  for (const node of nodes) {
    if (node.title.trim().length === 0) {
      issues.push({ code: 'emptyTitle', nodeId: node.id });
    }

    if (node.topic !== null && knownTopics.has(node.topic) === false) {
      issues.push({
        code: 'unknownTopic',
        nodeId: node.id,
        title: node.title,
        topic: node.topic,
      });
    }
  }

  return issues;
};

type BeschlussTranslate = (
  key: string,
  options?: Record<string, string>,
) => string;

export const beschlussIssueMessage = (
  t: BeschlussTranslate,
  issue: BeschlussDraftIssue,
): string => {
  switch (issue.code) {
    case 'emptyTitle':
      return t('decisionTemplate.errors.titleRequired');
    case 'unknownTopic':
      return t('decisionTemplate.errors.unknownTopic', {
        title: issue.title,
        name: issue.topic,
      });
    case 'cannotAddChild':
      return t('decisionTemplate.errors.cannotAddChild');
  }
};
