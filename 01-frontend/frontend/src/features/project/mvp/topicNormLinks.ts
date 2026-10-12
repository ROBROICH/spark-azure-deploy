import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';

export const isTopicNormLinkedToTopicId = (
  topicNorm: NodePayloadByType<'topic_norm'>,
  topicId: string,
) => {
  if (topicNorm.topicId) {
    return topicNorm.topicId === topicId;
  }

  return topicNorm.frontendParentIds.includes(
    toCompositeKey({ id: topicId, nodeType: 'topic' }),
  );
};
