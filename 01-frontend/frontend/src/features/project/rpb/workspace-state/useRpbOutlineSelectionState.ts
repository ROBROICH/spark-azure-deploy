import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useMemo, useTransition } from 'react';
import { setRpbOutlineSelectionSearch } from '../rpb.search';
import {
  findRpbOutlineEffectiveTopicId,
  flattenRpbOutlineNodeIds,
  normalizeRpbOutlineNodeId,
  type RpbOutlineTreeNode,
} from '../outline/rpbOutlineTree';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

const selectRpbOutlineSearch = (search: {
  outlineNodeId?: string;
  topicId?: string;
}) => ({
  outlineNodeId: search.outlineNodeId,
  topicId: search.topicId,
});

/**
 * Manages the URL-backed outline node and topic selection for RPB.
 */
export const useRpbOutlineSelectionState = (
  outlineTree: RpbOutlineTreeNode[],
  canNormalizeOutlineNodeId: boolean,
) => {
  const { outlineNodeId, topicId: selectedTopicId } = route.useSearch({
    select: selectRpbOutlineSearch,
  });
  const navigate = route.useNavigate();
  const [, startSelectionTransition] = useTransition();
  const selectableOutlineNodeIds = flattenRpbOutlineNodeIds(outlineTree);
  // eslint-disable-next-line no-restricted-syntax -- retained because selectOutlineNode is an explicit context command and depends on this Set.
  const selectableOutlineNodeIdSet = useMemo(
    () => new Set(selectableOutlineNodeIds),
    [selectableOutlineNodeIds],
  );
  const defaultOutlineNodeId = selectableOutlineNodeIds[0] ?? '';
  const selectedOutlineNodeId = canNormalizeOutlineNodeId
    ? normalizeRpbOutlineNodeId(
        outlineNodeId,
        selectableOutlineNodeIdSet,
        defaultOutlineNodeId,
        outlineTree,
      )
    : (outlineNodeId ?? '');
  // eslint-disable-next-line no-restricted-syntax -- exposed through context and must stay stable for outline row consumers
  const selectOutlineNode = useCallback(
    (nodeId: string) => {
      if (!canNormalizeOutlineNodeId) {
        return;
      }

      const normalizedNodeId = normalizeRpbOutlineNodeId(
        nodeId,
        selectableOutlineNodeIdSet,
        defaultOutlineNodeId,
        outlineTree,
      );
      const topicId = findRpbOutlineEffectiveTopicId(
        outlineTree,
        normalizedNodeId,
      );

      if (
        normalizedNodeId === selectedOutlineNodeId &&
        topicId === selectedTopicId
      ) {
        return;
      }

      const isTopicChange = topicId !== selectedTopicId;

      startSelectionTransition(() => {
        void navigate({
          search: (prev) =>
            setRpbOutlineSelectionSearch(prev, normalizedNodeId, topicId),
          replace: !isTopicChange,
          resetScroll: false,
        });
      });
    },
    [
      canNormalizeOutlineNodeId,
      defaultOutlineNodeId,
      outlineTree,
      navigate,
      selectableOutlineNodeIdSet,
      selectedOutlineNodeId,
      selectedTopicId,
      startSelectionTransition,
    ],
  );

  return {
    canNormalizeOutlineNodeId,
    navigate,
    outlineNodeId,
    selectedOutlineNodeId,
    selectedTopicId,
    selectOutlineNode,
  };
};
