import { tryFromCompositeKey } from '@/db/nodes/compositeKey';
import type { NodeRefByType, NodeTypeLiteral } from '@/db/nodes/types';

const COMPOSITE_PARENT_ID_PATTERN = /^[^:]+:.+$/;

export const getStoredParentRefByType = <T extends NodeTypeLiteral>(
  parentId: string,
  nodeType: T,
): NodeRefByType<T> | null => {
  if (!COMPOSITE_PARENT_ID_PATTERN.test(parentId)) {
    return null;
  }

  const parentRef = tryFromCompositeKey(parentId);

  if (!parentRef) {
    return null;
  }

  if (parentRef.node_type !== nodeType) {
    return null;
  }

  return parentRef as NodeRefByType<T>;
};
