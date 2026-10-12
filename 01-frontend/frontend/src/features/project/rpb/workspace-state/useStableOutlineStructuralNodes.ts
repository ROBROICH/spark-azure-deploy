import type { NodePayloadByType } from '@/db/nodes/types';
import { useMemo } from 'react';
import type { RpbOutlineStructuralNode } from '../outline/rpbOutlineTree';

/**
 * Drops editor-only payload fields such as `text` so outline consumers only
 * react to structural or checked-state changes.
 */
const toOutlineStructuralNode = (
  vaeNode: NodePayloadByType<'vae_node'>,
): RpbOutlineStructuralNode => {
  return {
    checkedByAssignee: vaeNode.checkedByAssignee,
    checkedByLeader: vaeNode.checkedByLeader,
    id: vaeNode.id,
    isDeleted: vaeNode.isDeleted,
    isHidden: vaeNode.isHidden,
    order: vaeNode.order,
    parentVaeNodeId: vaeNode.parentVaeNodeId,
    title: vaeNode.title,
    topicId: vaeNode.topicId ?? undefined,
  };
};

type SerializedOutlineStructuralNode = [
  checked_by_assignee: boolean,
  checked_by_leader: boolean,
  id: string,
  is_deleted: boolean,
  is_hidden: boolean,
  order: number,
  parent_vae_node_id: string | null,
  title: string,
  topic_id: string | null,
];

const serializeOutlineStructuralNodes = (
  vaeNodes: NodePayloadByType<'vae_node'>[],
) =>
  JSON.stringify(
    vaeNodes.map((vaeNode): SerializedOutlineStructuralNode => {
      const outlineNode = toOutlineStructuralNode(vaeNode);

      return [
        outlineNode.checkedByAssignee,
        outlineNode.checkedByLeader,
        outlineNode.id,
        outlineNode.isDeleted,
        outlineNode.isHidden,
        outlineNode.order,
        outlineNode.parentVaeNodeId,
        outlineNode.title,
        outlineNode.topicId ?? null,
      ];
    }),
  );

const parseOutlineStructuralNodes = (
  outlineStructuralNodes: string,
): RpbOutlineStructuralNode[] => {
  const serializedOutlineNodes = JSON.parse(
    outlineStructuralNodes,
  ) as SerializedOutlineStructuralNode[];

  return serializedOutlineNodes.map(
    ([
      checkedByAssignee,
      checkedByLeader,
      id,
      isDeleted,
      isHidden,
      order,
      parentVaeNodeId,
      title,
      topicId,
    ]) => ({
      checkedByAssignee,
      checkedByLeader,
      id,
      isDeleted,
      isHidden,
      order,
      parentVaeNodeId,
      title,
      topicId: topicId ?? undefined,
    }),
  );
};

export const useStableOutlineStructuralNodes = (
  vaeNodes: NodePayloadByType<'vae_node'>[],
) => {
  const outlineStructuralNodes = serializeOutlineStructuralNodes(vaeNodes);

  // eslint-disable-next-line no-restricted-syntax -- outline consumers rely on stable array identity when only editor-only VAE fields change.
  return useMemo(
    () => parseOutlineStructuralNodes(outlineStructuralNodes),
    [outlineStructuralNodes],
  );
};
