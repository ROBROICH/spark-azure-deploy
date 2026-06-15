import type { NodePayloadByType } from '@/db/nodes/types';
import { POPUP_CONTENT_INNER_VIEWPORT_CLASSES } from '@/features/ui/style/popupStyles';
import {
  ActionMenu,
  ActionMenuCheckboxItem,
  ActionMenuContent,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Button } from '@/features/ui/button/Button';
import { StatusBadge } from '@/features/ui/status-badge/StatusBadge';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type TeamTopicAssignmentPickerProps = {
  labelId: string;
  topics: NodePayloadByType<'topic'>[];
  value: string[];
  onChange: (value: string[]) => void;
  invalid?: boolean;
  'aria-describedby'?: string;
  ariaDescribedBy?: string;
};

const getSelectedTopics = (
  topics: NodePayloadByType<'topic'>[],
  selectedTopicIds: string[],
) => {
  const selectedTopicIdSet = new Set(selectedTopicIds);

  return topics.filter((topic) => selectedTopicIdSet.has(topic.id));
};

const sortedTopicsByInput = new WeakMap<
  NodePayloadByType<'topic'>[],
  NodePayloadByType<'topic'>[]
>();

const getTopicsSortedByName = (topics: NodePayloadByType<'topic'>[]) => {
  const cachedTopics = sortedTopicsByInput.get(topics);

  if (cachedTopics) {
    return cachedTopics;
  }

  const sortedTopics = [...topics].sort(
    (left, right) =>
      left.name.localeCompare(right.name, undefined, {
        sensitivity: 'base',
      }) || left.id.localeCompare(right.id),
  );
  sortedTopicsByInput.set(topics, sortedTopics);

  return sortedTopics;
};

export function TeamTopicAssignmentPicker(
  props: TeamTopicAssignmentPickerProps,
) {
  const {
    invalid = false,
    ariaDescribedBy,
    labelId,
    onChange,
    topics,
    value,
  } = props;
  const describedBy = props['aria-describedby'] ?? ariaDescribedBy;
  const { t } = useTranslation('Project');
  const triggerLabelId = `${labelId}-trigger`;
  const selectedTopicIds = new Set(value);
  const selectedTopics = getSelectedTopics(topics, value);
  const sortedTopics = getTopicsSortedByName(topics);

  const toggleTopic = (topicId: string) => {
    if (selectedTopicIds.has(topicId)) {
      onChange(value.filter((selectedTopicId) => selectedTopicId !== topicId));
      return;
    }

    onChange([...value, topicId]);
  };

  const removeTopic = (topicId: string) => {
    onChange(value.filter((selectedTopicId) => selectedTopicId !== topicId));
  };

  return (
    <div className="flex flex-col gap-3">
      <ActionMenu modal>
        <ActionMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-fit"
            disabled={topics.length === 0}
            aria-labelledby={`${labelId} ${triggerLabelId}`}
            aria-invalid={invalid}
            aria-describedby={describedBy}
          >
            <span id={triggerLabelId}>
              {t('Team.topicAssignment.addTopic')}
            </span>
          </Button>
        </ActionMenuTrigger>
        <ActionMenuContent
          align="start"
          className="max-h-80 w-[min(24rem,calc(100vw-2rem))] gap-0 overflow-y-auto"
        >
          <div className={POPUP_CONTENT_INNER_VIEWPORT_CLASSES}>
            {topics.length === 0 ? (
              <div className="px-2 py-1.5 text-[11px] leading-[14px] font-medium text-neutral-300">
                {t('Team.topicAssignment.empty')}
              </div>
            ) : (
              sortedTopics.map((topic) => {
                const checked = selectedTopicIds.has(topic.id);

                return (
                  <ActionMenuCheckboxItem
                    key={topic.id}
                    checked={checked}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={() => toggleTopic(topic.id)}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {checked ? (
                        <Check aria-hidden className="size-3" />
                      ) : null}
                    </span>
                    <span className="min-w-0 truncate">{topic.name}</span>
                  </ActionMenuCheckboxItem>
                );
              })
            )}
          </div>
        </ActionMenuContent>
      </ActionMenu>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] leading-[14px] font-medium tracking-[0.02em] text-text-secondary">
          {t('Team.topicAssignment.assignedTopics')}
        </p>
        {selectedTopics.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {selectedTopics.map((topic) => (
              <StatusBadge
                key={topic.id}
                variant="neutral"
                onRemove={() => removeTopic(topic.id)}
                removeLabel={t('Team.topicAssignment.removeTopic', {
                  topic: topic.name,
                })}
              >
                {topic.name}
              </StatusBadge>
            ))}
          </div>
        ) : (
          <p className="text-sm tracking-tight text-text-secondary">—</p>
        )}
      </div>
    </div>
  );
}
