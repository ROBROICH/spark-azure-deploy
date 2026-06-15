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
    checked_by_assignee: vaeNode.checked_by_assignee,
    checked_by_leader: vaeNode.checked_by_leader,
    id: vaeNode.id,
    is_deleted: vaeNode.is_deleted,
    is_hidden: vaeNode.is_hidden,
    order: vaeNode.order,
    parent_vae_node_id: vaeNode.parent_vae_node_id,
    title: vaeNode.title,
    topic_id: vaeNode.topic_id ?? undefined,
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
        outlineNode.checked_by_assignee,
        outlineNode.checked_by_leader,
        outlineNode.id,
        outlineNode.is_deleted,
        outlineNode.is_hidden,
        outlineNode.order,
        outlineNode.parent_vae_node_id,
        outlineNode.title,
        outlineNode.topic_id ?? null,
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
      checked_by_assignee,
      checked_by_leader,
      id,
      is_deleted,
      is_hidden,
      order,
      parent_vae_node_id,
      title,
      topic_id,
    ]) => ({
      checked_by_assignee,
      checked_by_leader,
      id,
      is_deleted,
      is_hidden,
      order,
      parent_vae_node_id,
      title,
      topic_id: topic_id ?? undefined,
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
