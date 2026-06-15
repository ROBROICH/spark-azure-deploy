import type { ProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import type { NodePayloadByType } from '@/db/nodes/types';
import { useNodes } from '@/db/nodes/hooks/useNodes';
import {
  collectUniqueTopicNormRefs,
  groupTopicNormRefsByTopicId,
  resolveTopicNormsByTopicId,
} from '../overview.logic';

export const useOverviewTopicNormsByTopicId = (
  topics: NodePayloadByType<'topic'>[],
  index: ProjectNodeIndex,
) => {
  const topicNormRefsByTopicId = groupTopicNormRefsByTopicId(topics, index);
  const topicNormRefs = collectUniqueTopicNormRefs(topicNormRefsByTopicId);
  const { data: topicNorms } = useNodes(topicNormRefs);

  return resolveTopicNormsByTopicId(topics, topicNormRefsByTopicId, topicNorms);
};
