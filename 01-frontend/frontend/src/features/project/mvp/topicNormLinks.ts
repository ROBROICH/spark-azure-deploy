import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';

export const isTopicNormLinkedToTopicId = (
  topicNorm: NodePayloadByType<'topic_norm'>,
  topicId: string,
) => {
  if (topicNorm.topic_id) {
    return topicNorm.topic_id === topicId;
  }

  return topicNorm.frontend_parent_ids.includes(
    toCompositeKey({ id: topicId, node_type: 'topic' }),
  );
};
