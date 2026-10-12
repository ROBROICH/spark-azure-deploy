import { invariant } from 'es-toolkit/util';
import type { NodeRef } from './types';

export type TypedDescendantCacheKey<TNodeType extends string> =
  `${string}\u001f${TNodeType}`;

type TypedDescendantTraversalState<TRef extends NodeRef> = {
  childrenByNodeId: Map<string, string[]>;
  nodeById: Map<string, TRef>;
};

export const createTypedDescendantCacheKey = <TNodeType extends string>(
  startId: string,
  type: TNodeType,
): TypedDescendantCacheKey<TNodeType> => `${startId}\u001f${type}`;

const enqueueUnseenNode = (
  queue: string[],
  seen: Set<string>,
  nodeId: string,
) => {
  if (seen.has(nodeId)) {
    return;
  }

  seen.add(nodeId);
  queue.push(nodeId);
};

const enqueueChildren = <TRef extends NodeRef>(
  state: TypedDescendantTraversalState<TRef>,
  queue: string[],
  seen: Set<string>,
  nodeId: string,
) => {
  for (const childId of state.childrenByNodeId.get(nodeId) ?? []) {
    enqueueUnseenNode(queue, seen, childId);
  }
};

const forEachDescendant = <TRef extends NodeRef>(
  state: TypedDescendantTraversalState<TRef>,
  startId: string,
  visit: (ref: TRef) => boolean | void,
) => {
  const queue: string[] = [];
  const seen = new Set<string>([startId]);

  enqueueChildren(state, queue, seen, startId);

  let index = 0;

  while (index < queue.length) {
    const nodeId = queue[index];
    invariant(nodeId !== undefined, 'Expected queued node id');
    index += 1;

    const ref = state.nodeById.get(nodeId);

    if (ref && visit(ref) === false) {
      return;
    }

    enqueueChildren(state, queue, seen, nodeId);
  }
};

const withTypedDescendants = <TNodeType extends string, TRef extends NodeRef>(
  state: TypedDescendantTraversalState<TRef>,
  startId: string,
  type: TNodeType,
  visit: (ref: TRef & { nodeType: TNodeType }) => boolean | void,
) => {
  forEachDescendant(state, startId, (ref) => {
    if (ref.nodeType !== type) {
      return;
    }

    return visit(ref as TRef & { nodeType: TNodeType });
  });
};

export const getTypedDescendantRefs = <
  TNodeType extends string,
  TRef extends NodeRef,
>(
  state: TypedDescendantTraversalState<TRef>,
  startId: string,
  type: TNodeType,
): (TRef & { nodeType: TNodeType })[] => {
  const refs: (TRef & { nodeType: TNodeType })[] = [];

  withTypedDescendants(state, startId, type, (ref) => {
    refs.push(ref);
  });

  return refs;
};

export const countTypedDescendants = <
  TNodeType extends string,
  TRef extends NodeRef,
>(
  state: TypedDescendantTraversalState<TRef>,
  startId: string,
  type: TNodeType,
) => {
  let count = 0;

  withTypedDescendants(state, startId, type, () => {
    count += 1;
  });

  return count;
};

export const hasTypedDescendant = <
  TNodeType extends string,
  TRef extends NodeRef,
>(
  state: TypedDescendantTraversalState<TRef>,
  startId: string,
  type: TNodeType,
) => {
  let hasMatch = false;

  withTypedDescendants(state, startId, type, () => {
    hasMatch = true;
    return false;
  });

  return hasMatch;
};

export const getFirstTypedDescendantRef = <
  TNodeType extends string,
  TRef extends NodeRef,
>(
  state: TypedDescendantTraversalState<TRef>,
  startId: string,
  type: TNodeType,
) => {
  let match: (TRef & { nodeType: TNodeType }) | null = null;

  withTypedDescendants(state, startId, type, (ref) => {
    match = ref;
    return false;
  });

  return match;
};
