import type { NodeTypeLiteral } from '@/db/nodes/types';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useLiveNodes } from '@/db/nodes/hooks/useLiveNodes';
import { useNodes } from '@/db/nodes/hooks/useNodes';

export function useNodesByType<T extends NodeTypeLiteral>(type: T) {
  const { getNodesByType } = useGraph();

  return useNodes(getNodesByType(type));
}

export function useLiveNodesByType<T extends NodeTypeLiteral>(type: T) {
  const { getNodesByType } = useGraph();

  return useLiveNodes(getNodesByType(type));
}
