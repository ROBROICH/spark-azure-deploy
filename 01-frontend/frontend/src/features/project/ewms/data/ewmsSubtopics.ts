import { getDescendantNodeRefsByType } from '@/db/nodes/examinationGraphModel';
import type { ProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import type { NodePayloadByType } from '@/db/nodes/types';
import type { EwmsTopicNode } from './ewms.nodes';

type SubtopicOption = { value: string; label: string };

export type EwmsSubtopicNode = NodePayloadByType<'subtopic'>;

const getSubtopicTopicId = (
  subtopic: EwmsSubtopicNode,
  topicIds: Set<string>,
) =>
  typeof subtopic.topic_id === 'string' && topicIds.has(subtopic.topic_id)
    ? subtopic.topic_id
    : null;

const getGraphSubtopicTopicIds = (
  index: ProjectNodeIndex,
  topics: EwmsTopicNode[],
) => {
  const topicIdsBySubtopicId = new Map<string, string[]>();

  for (const topic of topics) {
    for (const subtopicRef of getDescendantNodeRefsByType(
      index,
      topic.id,
      'subtopic',
    )) {
      topicIdsBySubtopicId.set(subtopicRef.id, [
        ...(topicIdsBySubtopicId.get(subtopicRef.id) ?? []),
        topic.id,
      ]);
    }
  }

  return topicIdsBySubtopicId;
};

const compareSubtopicOptions = (left: SubtopicOption, right: SubtopicOption) =>
  left.label.localeCompare(right.label, 'de', {
    numeric: true,
    sensitivity: 'base',
  }) || left.value.localeCompare(right.value, 'de');

/**
 * Groups subtopics by their payload topic first, falling back to graph edges for older payloads.
 */
export const buildEwmsSubtopicOptionsByTopic = (
  index: ProjectNodeIndex,
  topics: EwmsTopicNode[],
  subtopics: EwmsSubtopicNode[],
) => {
  const optionsByTopicId = new Map<string, SubtopicOption[]>();
  const topicIds = new Set(topics.map((topic) => topic.id));
  const graphTopicIdsBySubtopicId = getGraphSubtopicTopicIds(index, topics);

  for (const topic of topics) {
    optionsByTopicId.set(topic.id, []);
  }

  for (const subtopic of subtopics) {
    const payloadTopicId = getSubtopicTopicId(subtopic, topicIds);
    const targetTopicIds = payloadTopicId
      ? [payloadTopicId]
      : (graphTopicIdsBySubtopicId.get(subtopic.id) ?? []);

    for (const topicId of targetTopicIds) {
      optionsByTopicId.get(topicId)?.push({
        value: subtopic.id,
        label: subtopic.name,
      });
    }
  }

  for (const options of optionsByTopicId.values()) {
    options.sort(compareSubtopicOptions);
  }

  return optionsByTopicId;
};
