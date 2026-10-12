import type { NodePayloadByType } from '@/db/nodes/types';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useHasTopicMutationRights } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import { useAction } from '@/db/nodes/hooks/useAction';
import { useCallback, useMemo } from 'react';
import {
  areAllTopLevelRpbOutlineNodesChecked,
  createRpbOutlineCheckedStateById,
  type RpbOutlineTreeNode,
} from '../outline/rpbOutlineTree';

type RpbOutlineNodeCheckability = {
  canToggleChecked: boolean;
  effectiveTopicId?: string;
};

type UseRpbOutlineCheckStateLogicParams = {
  outlineTree: RpbOutlineTreeNode[];
  vaeNodes: NodePayloadByType<'vae_node'>[];
};

const getAttachedTopicId = (
  vaeNode: RpbOutlineTreeNode['vaeNode'],
): string | undefined => {
  return vaeNode.topicId ?? undefined;
};

const createRpbOutlineNodeCheckabilityById = (
  outlineTree: RpbOutlineTreeNode[],
  canApproveFinalDecision: boolean,
  canMutateProject: boolean,
  hasTopicMutationRights: (topicId: string) => boolean,
) => {
  const checkabilityById = new Map<string, RpbOutlineNodeCheckability>();
  const topicCheckabilityById = new Map<string, boolean>();

  const canToggleTopic = (topicId: string) => {
    const cachedCanToggle = topicCheckabilityById.get(topicId);
    if (cachedCanToggle !== undefined) {
      return cachedCanToggle;
    }

    const canToggle = hasTopicMutationRights(topicId);
    topicCheckabilityById.set(topicId, canToggle);
    return canToggle;
  };

  /**
   * Walks the outline tree once so descendants inherit the closest topic owner
   * before permission checks are cached per topic.
   */
  const visit = (
    node: RpbOutlineTreeNode,
    inheritedTopicId: string | undefined,
  ) => {
    const effectiveTopicId =
      getAttachedTopicId(node.vaeNode) ?? inheritedTopicId;
    const canToggleChecked = canApproveFinalDecision
      ? true
      : effectiveTopicId
        ? canToggleTopic(effectiveTopicId)
        : canMutateProject;

    checkabilityById.set(node.vaeNode.id, {
      canToggleChecked,
      effectiveTopicId,
    });

    for (const child of node.children) {
      visit(child, effectiveTopicId);
    }
  };

  for (const node of outlineTree) {
    visit(node, undefined);
  }

  return checkabilityById;
};

/**
 * Builds the role-aware checked-state context value and stable toggle callbacks
 * shared by outline rows and final-decision controls.
 */
// eslint-disable-next-line custom-size/limit-logic-function-lines -- the hook owns one context value boundary for checked-state derivation, permission lookup, and mutation callbacks
export const useRpbOutlineCheckStateLogic = (
  params: UseRpbOutlineCheckStateLogicParams,
) => {
  const { outlineTree, vaeNodes } = params;
  const { transact, update } = useAction();
  const { canMutateProject: canApproveFinalDecision } = useCanMutateProject({
    requiredLevel: 'owner',
  });
  const { canMutateProject } = useCanMutateProject({
    requiredLevel: 'user',
  });
  const hasTopicMutationRights = useHasTopicMutationRights();
  // eslint-disable-next-line no-restricted-syntax -- toggle handlers need a stable id lookup for the current VAE node payloads.
  const vaeNodeById = useMemo(
    () => new Map(vaeNodes.map((vaeNode) => [vaeNode.id, vaeNode])),
    [vaeNodes],
  );
  // eslint-disable-next-line no-restricted-syntax -- checked-state map identity is part of the outline check context value consumed by row leaves
  const checkedStateById = useMemo(
    () =>
      createRpbOutlineCheckedStateById(outlineTree, canApproveFinalDecision),
    [canApproveFinalDecision, outlineTree],
  );
  // eslint-disable-next-line no-restricted-syntax -- permission lookup is cached per outline tree so row callbacks do not recompute topic rights on every render
  const outlineNodeCheckabilityById = useMemo(
    () =>
      createRpbOutlineNodeCheckabilityById(
        outlineTree,
        canApproveFinalDecision,
        canMutateProject,
        hasTopicMutationRights,
      ),
    [
      canApproveFinalDecision,
      canMutateProject,
      hasTopicMutationRights,
      outlineTree,
    ],
  );
  // eslint-disable-next-line no-restricted-syntax -- exposed through context and must stay stable for outline row consumers
  const canToggleOutlineNodeChecked = useCallback(
    (nodeId: string) => {
      return outlineNodeCheckabilityById.get(nodeId)?.canToggleChecked ?? false;
    },
    [outlineNodeCheckabilityById],
  );
  // eslint-disable-next-line no-restricted-syntax -- exposed through context and must stay stable for outline row consumers
  const toggleOutlineNodeChecked = useCallback(
    (
      nodeId: string,
      canApproveFinalDecisionForToggle = canApproveFinalDecision,
    ) => {
      const vaeNode = vaeNodeById.get(nodeId);
      const nodeCheckability = outlineNodeCheckabilityById.get(nodeId);
      const shouldToggleFinalDecision =
        canApproveFinalDecisionForToggle && canApproveFinalDecision;

      if (!vaeNode || !nodeCheckability) {
        return;
      }

      if (canApproveFinalDecisionForToggle && !canApproveFinalDecision) {
        return;
      }

      if (!shouldToggleFinalDecision && !nodeCheckability.canToggleChecked) {
        return;
      }

      transact(() => {
        update(vaeNode, (draft) => {
          if (shouldToggleFinalDecision) {
            draft.checkedByLeader = !draft.checkedByLeader;
            return;
          }

          const nextChecked = !draft.checkedByAssignee;
          draft.checkedByAssignee = nextChecked;
          if (!nextChecked) {
            draft.checkedByLeader = false;
          }
        });
      });
    },
    [
      canApproveFinalDecision,
      outlineNodeCheckabilityById,
      transact,
      update,
      vaeNodeById,
    ],
  );

  // eslint-disable-next-line no-restricted-syntax -- provider context value identity should only change when checked-state inputs change
  return useMemo(
    () => ({
      allOutlineChecked: areAllTopLevelRpbOutlineNodesChecked(
        outlineTree,
        canApproveFinalDecision,
        checkedStateById,
      ),
      canApproveFinalDecision,
      canToggleOutlineNodeChecked,
      outlineCheckedStateById: checkedStateById,
      toggleOutlineNodeChecked,
    }),
    [
      canApproveFinalDecision,
      canToggleOutlineNodeChecked,
      checkedStateById,
      outlineTree,
      toggleOutlineNodeChecked,
    ],
  );
};
