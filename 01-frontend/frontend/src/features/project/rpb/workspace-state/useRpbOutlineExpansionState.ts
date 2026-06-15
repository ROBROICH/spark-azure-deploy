import { type SetStateAction, useState } from 'react';
import {
  findRpbOutlineAncestorIds,
  type RpbOutlineTreeNode,
} from '../outline/rpbOutlineTree';

const EMPTY_EXPANDED_NODE_IDS: string[] = [];
const createExpandedNodeIdSet = (expandedNodeIds: string[]) =>
  new Set(expandedNodeIds);

const mergeExpandedNodeIds = (
  expandedNodeIds: string[],
  ancestorIds: string[],
) => {
  const set = new Set(expandedNodeIds);
  const initialSize = set.size;

  for (const ancestorId of ancestorIds) {
    set.add(ancestorId);
  }

  if (set.size === initialSize) {
    return expandedNodeIds;
  }

  return [...set];
};

type ExpansionState = {
  expandedNodeIds: string[];
  outlineTree: RpbOutlineTreeNode[];
  selectedOutlineNodeId: string;
};

export const useRpbOutlineExpansionState = (
  outlineTree: RpbOutlineTreeNode[],
  selectedOutlineNodeId: string,
) => {
  // eslint-disable-next-line no-restricted-syntax -- accordion expansion is user-controlled ephemeral UI state that must survive beyond the currently selected outline node and should not persist in the URL
  const [expansionState, setExpansionState] = useState<ExpansionState>(() => ({
    expandedNodeIds: mergeExpandedNodeIds(
      EMPTY_EXPANDED_NODE_IDS,
      findRpbOutlineAncestorIds(outlineTree, selectedOutlineNodeId),
    ),
    selectedOutlineNodeId,
    outlineTree,
  }));
  let effectiveExpandedNodeIds = expansionState.expandedNodeIds;

  if (
    expansionState.outlineTree !== outlineTree ||
    expansionState.selectedOutlineNodeId !== selectedOutlineNodeId
  ) {
    effectiveExpandedNodeIds = mergeExpandedNodeIds(
      expansionState.expandedNodeIds,
      findRpbOutlineAncestorIds(outlineTree, selectedOutlineNodeId),
    );
    setExpansionState({
      expandedNodeIds: effectiveExpandedNodeIds,
      outlineTree,
      selectedOutlineNodeId,
    });
  }

  const setExpandedNodeIds = (nextValue: SetStateAction<string[]>) => {
    setExpansionState((currentState) => ({
      ...currentState,
      expandedNodeIds:
        typeof nextValue === 'function'
          ? nextValue(currentState.expandedNodeIds)
          : nextValue,
    }));
  };

  const expandAncestors = (nodeId: string) => {
    const ancestorIds = findRpbOutlineAncestorIds(outlineTree, nodeId);
    if (ancestorIds.length === 0) {
      return;
    }

    setExpandedNodeIds((prev) => mergeExpandedNodeIds(prev, ancestorIds));
  };

  const expandedNodeIdSet = createExpandedNodeIdSet(effectiveExpandedNodeIds);

  return {
    expandedNodeIds: effectiveExpandedNodeIds,
    expandedNodeIdSet,
    setExpandedNodeIds,
    expandAncestors,
  };
};
