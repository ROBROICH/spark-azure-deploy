import { MessageCircleWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  EwmsArgumentNode,
  EwmsBeteiligungsEingang,
  EwmsTopicNode,
} from '../../data/ewms.nodes';
import { ArgumentItemsList } from './ArgumentItemsList';

type TopicArgumentsListProps = {
  selectedTopic: EwmsTopicNode | undefined;
  argumentsList: EwmsArgumentNode[];
  entriesById: Map<string, EwmsBeteiligungsEingang>;
  topics: EwmsTopicNode[];
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

export const TopicArgumentsList = (props: TopicArgumentsListProps) => {
  const {
    selectedTopic,
    argumentsList,
    entriesById,
    topics,
    onDeleteArgument,
    onToggleArgument,
    onUpdateArgumentTopic,
    onUpdateArgumentSubtopic,
    onReviewArgumentClassification,
    onSelectArgument,
  } = props;
  const { t } = useTranslation('Ewms');

  if (!selectedTopic) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-text-secondary">
        <MessageCircleWarning className="size-8 opacity-40" />
        <p className="text-body-s">{t('topics.empty')}</p>
      </div>
    );
  }

  return (
    <ArgumentItemsList
      argumentsList={argumentsList}
      entriesById={entriesById}
      topics={topics}
      onDeleteArgument={onDeleteArgument}
      onToggleArgument={onToggleArgument}
      onUpdateArgumentTopic={onUpdateArgumentTopic}
      onUpdateArgumentSubtopic={onUpdateArgumentSubtopic}
      onReviewArgumentClassification={onReviewArgumentClassification}
      onSelectArgument={onSelectArgument}
    />
  );
};
