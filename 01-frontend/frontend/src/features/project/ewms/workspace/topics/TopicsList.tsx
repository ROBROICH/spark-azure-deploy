import type { EwmsArgumentNode, EwmsTopicNode } from '../../data/ewms.nodes';
import { groupArgumentsByTopicId } from '../../data/ewms.nodes';
import { EWMS_UNASSIGNED_SUBTOPIC_SELECTION } from '../../data/ewmsSubtopicSelection';
import { useEwmsSubtopics } from '../EwmsSubtopicsContext';
import { TopicRow, type TopicSubtopicRow } from './TopicRow';

type TopicsListProps = {
  topics: EwmsTopicNode[];
  argumentsList: EwmsArgumentNode[];
  expandedTopicGroupId: string | undefined;
  selectedSubtopicId: string | undefined;
  selectedTopicId: string | undefined;
  onExpandTopicGroup: (id: string) => void;
  onSelectSubtopic: (topicId: string, subtopicId: string) => void;
  onSelectTopic: (id: string) => void;
};

const getSubtopicArguments = (
  argumentsList: EwmsArgumentNode[],
  subtopicId: string,
) => {
  if (subtopicId === EWMS_UNASSIGNED_SUBTOPIC_SELECTION) {
    return argumentsList.filter((argument) => !argument.sub_topic_id);
  }

  return argumentsList.filter(
    (argument) => argument.sub_topic_id === subtopicId,
  );
};

export const TopicsList = (props: TopicsListProps) => {
  const {
    topics,
    argumentsList,
    expandedTopicGroupId,
    selectedSubtopicId,
    selectedTopicId,
    onExpandTopicGroup,
    onSelectSubtopic,
    onSelectTopic,
  } = props;
  const { getSubtopicItemsForTopic } = useEwmsSubtopics();
  const argumentsByTopicId = groupArgumentsByTopicId(argumentsList);

  return (
    <div
      role="list"
      className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2"
    >
      {topics.map((topic) => {
        const topicArguments = argumentsByTopicId.get(topic.id) ?? [];
        const subtopicItems = getSubtopicItemsForTopic(topic.id);
        const isExpandable = subtopicItems.length > 0;
        const isExpanded =
          isExpandable &&
          (expandedTopicGroupId === topic.id ||
            (selectedTopicId === topic.id && selectedSubtopicId !== undefined));
        const subtopicRows: TopicSubtopicRow[] = [
          {
            id: EWMS_UNASSIGNED_SUBTOPIC_SELECTION,
            name: null,
            argumentsList: getSubtopicArguments(
              topicArguments,
              EWMS_UNASSIGNED_SUBTOPIC_SELECTION,
            ),
          },
          ...subtopicItems.map((subtopic) => ({
            id: subtopic.value,
            name: subtopic.label,
            argumentsList: getSubtopicArguments(topicArguments, subtopic.value),
          })),
        ];

        return (
          <TopicRow
            key={topic.id}
            topic={topic}
            argumentsList={topicArguments}
            isExpandable={isExpandable}
            isExpanded={isExpanded}
            isSelected={selectedTopicId === topic.id && !selectedSubtopicId}
            selectedTopicId={selectedTopicId}
            selectedSubtopicId={selectedSubtopicId}
            subtopicRows={subtopicRows}
            onExpand={() => onExpandTopicGroup(isExpanded ? '' : topic.id)}
            onSelect={onSelectTopic}
            onSelectSubtopic={onSelectSubtopic}
          />
        );
      })}
    </div>
  );
};
