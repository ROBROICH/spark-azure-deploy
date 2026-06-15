import type { NodeTypeLiteral } from '@/db/nodes/types';
import { ROOT_TYPE, TOPIC_TYPE } from './typeLevelGraph.constants';

export function compareTypePriority(
  left: NodeTypeLiteral,
  right: NodeTypeLiteral,
) {
  if (left === ROOT_TYPE && right !== ROOT_TYPE) {
    return -1;
  }

  if (right === ROOT_TYPE && left !== ROOT_TYPE) {
    return 1;
  }

  if (left === TOPIC_TYPE && right !== TOPIC_TYPE) {
    return -1;
  }

  if (right === TOPIC_TYPE && left !== TOPIC_TYPE) {
    return 1;
  }

  return left.localeCompare(right, 'de', {
    sensitivity: 'base',
  });
}

export function sortPresentTypes(
  nodeCountsByType: Map<NodeTypeLiteral, number>,
) {
  return Array.from(nodeCountsByType.keys()).sort((left, right) => {
    const countDifference =
      (nodeCountsByType.get(right) ?? 0) - (nodeCountsByType.get(left) ?? 0);

    if (countDifference !== 0) {
      return countDifference;
    }

    return compareTypePriority(left, right);
  });
}
