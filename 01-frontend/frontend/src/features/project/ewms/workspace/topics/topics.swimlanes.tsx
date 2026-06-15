import { SplitButton } from '@/features/ui/button/SplitButton';
import { Swimlanes } from '@/features/ui/swimlanes/Swimlanes';
import { Book, MessageCircleWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ArgumentsToolbar } from '../arguments/ArgumentsToolbar';
import { TopicArgumentsList } from '../arguments/TopicArgumentsList';
import type {
  EwmsArgumentNode,
  EwmsBeteiligungsEingang,
  EwmsTopicNode,
} from '../../data/ewms.nodes';
import { isEwmsArgumentApproved } from '../../data/ewms.nodes';
import { TopicsList } from './TopicsList';

// EWMS intentionally keeps local swimlane roots inside each tab/detail workflow.
// This is a deliberate exception to the workspace-wide swimlane owners expected
// by .agents/rules/codebase-structure/project-swimlane-owners.md.
type TopicsContentProps = {
  topics: EwmsTopicNode[];
  allArguments: EwmsArgumentNode[];
  selectedTopicArguments: EwmsArgumentNode[];
  entriesById: Map<string, EwmsBeteiligungsEingang>;
  selectedSubtopicId: string | undefined;
  selectedTopicId: string | undefined;
  onSelectTopic: (id: string) => void;
  onSelectSubtopic: (topicId: string, subtopicId: string) => void;
  expandedTopicGroupId: string | undefined;
  onExpandTopicGroup: (id: string) => void;
  onSetArgumentsApproval: (
    argumentsList: EwmsArgumentNode[],
    checked: boolean,
  ) => void;
  onDeleteArgument: (argument: EwmsArgumentNode) => void;
  onToggleArgument: (argument: EwmsArgumentNode) => void;
  onUpdateArgumentTopic: (argument: EwmsArgumentNode, topicId: string) => void;
  onUpdateArgumentSubtopic: (
    argument: EwmsArgumentNode,
    subtopicId: string,
  ) => void;
  onReviewArgumentClassification: (
    argument: EwmsArgumentNode,
    isAccepted: boolean,
  ) => void;
  onSelectArgument?: (argumentId: string, trigger: HTMLElement) => void;
};

export const TopicsContent = (props: TopicsContentProps) => {
  const {
    topics,
    allArguments,
    selectedTopicArguments,
    entriesById,
    selectedSubtopicId,
    selectedTopicId,
    onSelectTopic,
    onSelectSubtopic,
    expandedTopicGroupId,
    onExpandTopicGroup,
    onSetArgumentsApproval,
    onDeleteArgument,
    onToggleArgument,
    onUpdateArgumentTopic,
    onUpdateArgumentSubtopic,
    onReviewArgumentClassification,
    onSelectArgument,
  } = props;
  const { t } = useTranslation('Ewms');

  const selectedTopic = selectedTopicId
    ? topics.find((entry) => entry.id === selectedTopicId)
    : undefined;

  const totalCount = selectedTopicArguments.length;
  const approvedCount = selectedTopicArguments.filter((arg) =>
    isEwmsArgumentApproved(arg),
  ).length;
  const areAllArgumentsApproved =
    totalCount > 0 && approvedCount === totalCount;

  return (
    <Swimlanes>
      <Swimlanes.Lane id="topics" title={t('topics.title')} icon={Book}>
        <TopicsList
          topics={topics}
          argumentsList={allArguments}
          expandedTopicGroupId={expandedTopicGroupId}
          selectedSubtopicId={selectedSubtopicId}
          selectedTopicId={selectedTopicId}
          onExpandTopicGroup={onExpandTopicGroup}
          onSelectSubtopic={onSelectSubtopic}
          onSelectTopic={onSelectTopic}
        />
      </Swimlanes.Lane>

      <Swimlanes.Lane
        id="arguments"
        title={t('arguments.title')}
        icon={MessageCircleWarning}
        action={
          <SplitButton
            checked={areAllArgumentsApproved}
            disabled={!selectedTopic}
            onCheckedChange={(checked) => {
              if (!selectedTopic) {
                return;
              }
              onSetArgumentsApproval(selectedTopicArguments, checked);
            }}
            size="md"
            aria-label={t('arguments.toggleLabel')}
            checkedLabel={t('arguments.checked')}
            uncheckedLabel={t('arguments.checkAll')}
          />
        }
      >
        <ArgumentsToolbar
          totalCount={totalCount}
          approvedCount={approvedCount}
        />
        <TopicArgumentsList
          selectedTopic={selectedTopic}
          argumentsList={selectedTopicArguments}
          entriesById={entriesById}
          topics={topics}
          onDeleteArgument={onDeleteArgument}
          onToggleArgument={onToggleArgument}
          onUpdateArgumentTopic={onUpdateArgumentTopic}
          onUpdateArgumentSubtopic={onUpdateArgumentSubtopic}
          onReviewArgumentClassification={onReviewArgumentClassification}
          onSelectArgument={onSelectArgument}
        />
      </Swimlanes.Lane>
    </Swimlanes>
  );
};
