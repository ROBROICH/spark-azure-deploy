import type { NodePayloadByType } from '@/db/nodes/types';

type BeschlussSection = {
  depth: number;
  index: number;
  isEditable: boolean;
  order: NodePayloadByType<'vae_node'>['order'];
  parentVaeNodeId: NodePayloadByType<'vae_node'>['parent_vae_node_id'];
  title: string;
  text: NodePayloadByType<'vae_node'>['text'];
  vaeNodeId: NodePayloadByType<'vae_node'>['id'];
};

export type { BeschlussSection };
