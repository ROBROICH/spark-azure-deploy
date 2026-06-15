import type { NodePayloadByType } from '../types';
import { useLiveNodesByType, useNodesByType } from './useNodesByType';

const sortTopicsByName = (topics: NodePayloadByType<'topic'>[]) =>
  [...topics].sort(
    (left, right) =>
      left.name.localeCompare(right.name, 'de', {
        numeric: true,
        sensitivity: 'base',
      }) || left.id.localeCompare(right.id, 'de'),
  );

export function useTopicNodes() {
  const result = useNodesByType('topic');

  const topics = sortTopicsByName(result.data);

  return {
    ...result,
    data: topics,
  };
}

export function useLiveTopicNodes() {
  const result = useLiveNodesByType('topic');

  const topics = sortTopicsByName(result.data);

  return {
    ...result,
    data: topics,
  };
}
