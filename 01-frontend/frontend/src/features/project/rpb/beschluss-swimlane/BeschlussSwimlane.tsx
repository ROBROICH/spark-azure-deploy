import { useLiveNode } from '@/db/nodes/hooks/useLiveNodes';
import { useNodesByType } from '@/db/nodes/hooks/useNodesByType';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useHasTopicMutationRights } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import { TopicWritePermissionBadge } from '@/features/access-control/topic-permissions/TopicWritePermissionBadge';
import { useAction } from '@/db/nodes/hooks/useAction';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NodePayloadByType } from '@/db/nodes/types';
import { useRpbFeatureContext } from '../workspace-state/RpbFeatureContext';
import { useRpbVaeNodeUrlState } from '../workspace-state/RpbOutlineContext';
import type { BeschlussSection } from '../rpbBeschluss.types';
import { formatNodeNumber } from '../outline/outlineNumbering';
import {
  buildRpbOutlineTree,
  type RpbOutlineTreeNode,
} from '../outline/rpbOutlineTree';
import { BeschlussEditor } from './BeschlussEditor';
import { FinalizeProcedureDialog } from './FinalizeProcedureDialog';

const appendBeschlussSections = (
  nodes: RpbOutlineTreeNode<NodePayloadByType<'vae_node'>>[],
  sections: BeschlussSection[],
  vaeNodeById: Map<string, NodePayloadByType<'vae_node'>>,
  hasTopicMutationRights: (topicId: string) => boolean,
  canMutateProject: boolean,
  inheritedTopicId?: string,
  depth = 0,
  indexPath: number[] = [],
) => {
  nodes.forEach((node, index) => {
    const topicId = node.vaeNode.topic_id ?? inheritedTopicId;
    const currentIndexPath = [...indexPath, index];
    const titlePrefix = formatNodeNumber(depth, currentIndexPath);

    vaeNodeById.set(node.vaeNode.id, node.vaeNode);
    sections.push({
      depth,
      index,
      isEditable: topicId ? hasTopicMutationRights(topicId) : canMutateProject,
      order: node.vaeNode.order,
      parentVaeNodeId: node.vaeNode.parent_vae_node_id,
      text: node.vaeNode.text,
      title: `${titlePrefix} ${node.vaeNode.title}`,
      vaeNodeId: node.vaeNode.id,
    });
    appendBeschlussSections(
      node.children,
      sections,
      vaeNodeById,
      hasTopicMutationRights,
      canMutateProject,
      topicId,
      depth + 1,
      currentIndexPath,
    );
  });
};

/**
 * Builds the editable Beschluss sections from the VAE outline and decorates the
 * editor header with the selected chapter's effective topic permission state.
 */
export const BeschlussSwimlane = () => {
  const { transact, update } = useAction();
  const { data: vaeNodes } = useNodesByType('vae_node');
  const hasTopicMutationRights = useHasTopicMutationRights();
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const { canMutateProject: canExportBeschluss } = useCanMutateProject({
    requiredLevel: 'owner',
  });
  const { trackBeschlussCommit } = useRpbFeatureContext();
  const { onVaeNodeSelect, selectedVaeNodeAssignedTopicId, selectedVaeNodeId } =
    useRpbVaeNodeUrlState();
  const selectedTopicRef = selectedVaeNodeAssignedTopicId
    ? ({
        id: selectedVaeNodeAssignedTopicId,
        node_type: 'topic',
      } as const)
    : null;
  const { data: selectedTopic } = useLiveNode(selectedTopicRef);
  const { t } = useTranslation('Rpb');
  // eslint-disable-next-line no-restricted-syntax -- export modal visibility is local to the Beschluss panel
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
  // eslint-disable-next-line no-restricted-syntax -- flattening the outline builds stable editor sections and lookup maps for the memoized TipTap editor boundary.
  const { sections, vaeNodeById } = useMemo(() => {
    const nextVaeNodeById = new Map<string, NodePayloadByType<'vae_node'>>();
    const nextSections: BeschlussSection[] = [];
    const outlineTree = buildRpbOutlineTree(vaeNodes);

    appendBeschlussSections(
      outlineTree,
      nextSections,
      nextVaeNodeById,
      hasTopicMutationRights,
      canMutateProject,
    );

    return {
      sections: nextSections,
      vaeNodeById: nextVaeNodeById,
    };
  }, [canMutateProject, hasTopicMutationRights, vaeNodes]);
  // eslint-disable-next-line no-restricted-syntax -- selected badge state should only change when the selected inherited topic or topic payload changes.
  const selectedTopicAssigneeIds = useMemo(
    () =>
      selectedVaeNodeAssignedTopicId
        ? (selectedTopic?.mvp_assignees ?? [])
        : null,
    [selectedTopic?.mvp_assignees, selectedVaeNodeAssignedTopicId],
  );
  // eslint-disable-next-line no-restricted-syntax -- the memoized TipTap editor should not rerender when unrelated Beschluss panel state changes.
  const headerAccessory = useMemo(
    () => (
      <TopicWritePermissionBadge
        assigneeIds={selectedTopicAssigneeIds}
        variant="large"
      />
    ),
    [selectedTopicAssigneeIds],
  );

  // eslint-disable-next-line no-restricted-syntax -- passed into a memoized TipTap editor boundary where stable handler identity avoids editor prop churn.
  const handleTextBlur = useCallback(
    (outlineNodeId: string, nextText: string) => {
      const vaeNode = vaeNodeById.get(outlineNodeId);
      const section = sections.find(
        (candidate) => candidate.vaeNodeId === outlineNodeId,
      );
      if (!vaeNode || !section?.isEditable || nextText === vaeNode.text) {
        return;
      }

      const tx = transact(() => {
        update(vaeNode, (draft) => {
          draft.text = nextText;
        });
      });
      trackBeschlussCommit(tx.isPersisted.promise);
    },
    [sections, trackBeschlussCommit, transact, update, vaeNodeById],
  );

  // eslint-disable-next-line no-restricted-syntax -- passed into a memoized TipTap editor boundary where stable handler identity avoids editor prop churn.
  const handleExportClick = useCallback(() => {
    if (!canExportBeschluss) {
      return;
    }

    setIsFinalizeDialogOpen(true);
  }, [canExportBeschluss]);

  if (sections.length === 0) {
    return (
      <div className="text-content-secondary flex flex-1 items-center justify-center p-4 text-sm">
        {t('beschluss.emptyState')}
      </div>
    );
  }

  return (
    <>
      {isFinalizeDialogOpen ? (
        <FinalizeProcedureDialog onOpenChange={setIsFinalizeDialogOpen} />
      ) : null}

      <BeschlussEditor
        canExport={canExportBeschluss}
        headerAccessory={headerAccessory}
        sections={sections}
        selectedVaeNodeId={selectedVaeNodeId}
        onVaeNodeSelect={onVaeNodeSelect}
        onExportClick={handleExportClick}
        onTextBlur={handleTextBlur}
      />
    </>
  );
};
