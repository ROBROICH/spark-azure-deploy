import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { Button } from '@/features/ui/button/Button';
import { SplitButton } from '@/features/ui/button/SplitButton';
import {
  SelectMenu,
  type SelectMenuItem,
} from '@/features/ui/select-menu/SelectMenu';
import { AiSuggestionBadge } from '@/features/ui/ai-suggestion-badge/AiSuggestionBadge';
import { cn } from '@/features/ui/style/cn';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ArgumentClassificationReviewActions } from '../shared-ui/ArgumentClassificationReviewActions';
import type { EwmsArgumentStatus, EwmsTopicNode } from '../data/ewms.nodes';
import {
  isEwmsVisibleTopic,
  normalizeEwmsArgumentStatus,
} from '../data/ewms.nodes';
import { useEwmsSubtopics } from '../workspace/EwmsSubtopicsContext';

type TopicClassificationToolbarProps = {
  referenceId: string;
  argumentStatus: EwmsArgumentStatus;
  topics: EwmsTopicNode[];
  topicId: string;
  subtopicId: string;
  isTopicReviewOpen: boolean;
  isApproved: boolean;
  onBack: () => void;
  onTopicIdChange: (topicId: string) => void;
  onSubtopicIdChange: (subtopicId: string) => void;
  onAcceptClassification: () => void;
  onRejectClassification: () => void;
  onToggleApproval: () => void;
};

type ArgumentTitleProps = {
  referenceId: string;
  status: EwmsArgumentStatus;
};

const ArgumentTitle = (props: ArgumentTitleProps) => {
  const { referenceId, status } = props;
  const normalizedStatus = normalizeEwmsArgumentStatus(status);
  const isOpen = normalizedStatus === 'open';
  const isDone = normalizedStatus === 'done';

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 rounded px-1 py-0.5 text-[16px] leading-[22px] font-medium',
        isDone && 'border-[0.5px] border-green-600 bg-green-50 text-green-900',
        !isOpen && !isDone && 'text-slate-950',
      )}
    >
      {isOpen && <AiSuggestionBadge iconOnly />}
      <span
        className={cn(
          'min-w-0 truncate',
          isOpen &&
            'bg-linear-to-b from-[rgba(147,51,234,1)] to-[rgba(88,28,135,1)] bg-clip-text text-transparent',
        )}
      >
        {referenceId}
      </span>
    </span>
  );
};

/**
 * Header toolbar for argument classification actions and assignments.
 */
export const TopicClassificationToolbar = (
  props: TopicClassificationToolbarProps,
) => {
  const {
    referenceId,
    argumentStatus,
    topics,
    topicId,
    subtopicId,
    isTopicReviewOpen,
    isApproved,
    onBack,
    onTopicIdChange,
    onSubtopicIdChange,
    onAcceptClassification,
    onRejectClassification,
    onToggleApproval,
  } = props;
  const { t } = useTranslation('Ewms');
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const { getSubtopicItemsForTopic } = useEwmsSubtopics();

  const topicItems: SelectMenuItem[] = topics
    .filter(isEwmsVisibleTopic)
    .map((topic) => ({
      value: topic.id,
      label: topic.name,
    }));
  const subtopicItems = getSubtopicItemsForTopic(topicId);

  return (
    <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-2 py-[7px]">
      <Button
        autoFocus
        onClick={onBack}
        variant="secondary"
        iconOnly
        aria-label={t('topicClassification.back')}
      >
        <ChevronLeft className="size-4" />
      </Button>

      <ArgumentTitle referenceId={referenceId} status={argumentStatus} />

      <div className="ml-auto flex shrink-0 items-center gap-2 rounded-lg bg-slate-100 p-1">
        <SelectMenu
          variant="badge"
          items={topicItems}
          value={topicId}
          placeholder={t('arguments.unassignedTopic')}
          ariaLabel={t('topicClassification.topicNameLabel')}
          triggerClassName={isTopicReviewOpen ? 'border-purple-500' : undefined}
          valueClassName={isTopicReviewOpen ? 'text-purple-700' : undefined}
          disabled={!canMutateProject}
          onChange={onTopicIdChange}
        />
        <SelectMenu
          variant="badge"
          items={subtopicItems}
          value={subtopicId}
          placeholder={t('arguments.unassignedSubtopic')}
          ariaLabel={t('topicClassification.subtopicNameLabel')}
          triggerClassName={isTopicReviewOpen ? 'border-purple-500' : undefined}
          valueClassName={isTopicReviewOpen ? 'text-purple-700' : undefined}
          disabled={!canMutateProject || subtopicItems.length === 0}
          onChange={onSubtopicIdChange}
        />

        {isTopicReviewOpen && (
          <ArgumentClassificationReviewActions
            referenceId={referenceId}
            disabled={!canMutateProject}
            onAccept={onAcceptClassification}
            onReject={onRejectClassification}
          />
        )}
      </div>

      <SplitButton
        checked={isApproved}
        onCheckedChange={onToggleApproval}
        disabled={!canMutateProject}
        size="sm"
        checkedLabel={t('arguments.approved')}
        uncheckedLabel={t('arguments.approve')}
        aria-label={
          isApproved
            ? t('arguments.approvedArgumentLabel', { referenceId })
            : t('arguments.approveArgumentLabel', { referenceId })
        }
      />
    </div>
  );
};
