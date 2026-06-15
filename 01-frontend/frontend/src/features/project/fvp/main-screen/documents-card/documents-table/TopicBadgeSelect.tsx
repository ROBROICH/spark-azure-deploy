import { useFvpTopicAssignment } from '@/features/project/fvp/main-screen/documents-card/documents-table/FvpTopicAssignmentContext';
import {
  ActionMenuCheckboxItem,
  ActionMenuItem,
  ActionMenuSeparator,
} from '@/features/ui/action-menu/ActionMenu';
import { cn } from '@/features/ui/style/cn';
import { Check, Tags } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeSelect } from './BadgeSelect';
import { MENU_ITEM_CLASSES, MENU_ITEM_SELECTED_CLASSES } from './menuStyles';

type TopicBadgeSelectProps = {
  dmsFileId: string;
  disabled?: boolean;
};

type TopicOption = {
  id: string;
  label: string;
};

const areTopicIdsEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((topicId) => rightSet.has(topicId));
};

const getSelectedTopicNames = (
  topicOptions: TopicOption[],
  selectedTopicIds: ReadonlySet<string>,
) => {
  const selectedNames: string[] = [];

  for (const topic of topicOptions) {
    if (selectedTopicIds.has(topic.id)) {
      selectedNames.push(topic.label);
    }
  }

  return selectedNames;
};

/**
 * Renders the multi-select topic dropdown for a document row and commits the
 * draft topic assignment once the dropdown closes.
 *
 * @param props Topic selector props containing the DMS file id.
 * @returns The topic assignment badge dropdown.
 */
export const TopicBadgeSelect = (props: TopicBadgeSelectProps) => {
  const { dmsFileId, disabled = false } = props;
  const { t } = useTranslation('FormalCompletenessCheck');
  const { commitTopicIds, hasLinkedDocument, selectedTopicIds, topicOptions } =
    useFvpTopicAssignment(dmsFileId);
  // eslint-disable-next-line no-restricted-syntax -- dropdown visibility is ephemeral menu state.
  const [isOpen, setIsOpen] = useState(false);
  // eslint-disable-next-line no-restricted-syntax -- draft selection stays local until the menu closes and commits.
  const [draftTopicIds, setDraftTopicIds] = useState(selectedTopicIds);

  const committedSelectedSet = new Set(selectedTopicIds);
  const committedSelectedNames = getSelectedTopicNames(
    topicOptions,
    committedSelectedSet,
  );
  const draftSelectedSet = new Set(draftTopicIds);
  const draftSelectedNames = getSelectedTopicNames(
    topicOptions,
    draftSelectedSet,
  );

  const label =
    committedSelectedNames.length === 0
      ? t('DocumentsCard.table.topic.placeholder')
      : committedSelectedNames.length === 1
        ? committedSelectedNames[0]
        : t('redesign.documentsCard.topic.selectedCount', {
            count: committedSelectedNames.length,
          });
  const isTriggerDisabled = disabled || !hasLinkedDocument;
  const readOnlyItemClassName = disabled ? 'cursor-not-allowed opacity-50' : '';

  const commitDraftTopicIds = () => {
    if (disabled) {
      return;
    }

    if (!areTopicIdsEqual(draftTopicIds, selectedTopicIds)) {
      commitTopicIds(dmsFileId, draftTopicIds);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftTopicIds(selectedTopicIds);
      setIsOpen(true);
      return;
    }

    commitDraftTopicIds();
    setIsOpen(false);
  };

  const toggleTopic = (topicId: string) => {
    if (disabled) {
      return;
    }

    setDraftTopicIds((currentTopicIds) => {
      const currentSet = new Set(currentTopicIds);
      return currentSet.has(topicId)
        ? currentTopicIds.filter((id) => id !== topicId)
        : [...currentTopicIds, topicId];
    });
  };

  const clearAll = () => {
    if (disabled) {
      return;
    }

    setDraftTopicIds([]);
  };

  return (
    <BadgeSelect
      variant="default"
      icon={<Tags aria-hidden="true" />}
      label={label}
      ariaLabel={
        committedSelectedNames.length === 0
          ? t('DocumentsCard.table.topic.ariaLabel')
          : t('DocumentsCard.table.topic.ariaLabelWithValue', { value: label })
      }
      open={isOpen}
      onOpenChange={handleOpenChange}
      disabled={isTriggerDisabled}
      align="start"
      contentClassName="max-h-80 overflow-y-auto"
    >
      {topicOptions.length === 0 && (
        <ActionMenuItem disabled className={MENU_ITEM_CLASSES}>
          {t('redesign.documentsCard.topic.empty')}
        </ActionMenuItem>
      )}
      {topicOptions.map((topic) => {
        const isSelected = draftSelectedSet.has(topic.id);
        return (
          <ActionMenuCheckboxItem
            key={topic.id}
            checked={isSelected}
            onSelect={(event) => {
              event.preventDefault();
              if (disabled) {
                return;
              }
              toggleTopic(topic.id);
            }}
            className={cn(
              MENU_ITEM_CLASSES,
              isSelected && MENU_ITEM_SELECTED_CLASSES,
              readOnlyItemClassName,
            )}
          >
            <span
              className={cn(
                'truncate text-[11px] leading-[14px] font-medium tracking-[0.22px]',
                isSelected ? 'text-neutral-white' : 'text-slate-300',
              )}
            >
              {topic.label}
            </span>
            {isSelected && (
              <Check className="size-4 text-neutral-white" aria-hidden />
            )}
          </ActionMenuCheckboxItem>
        );
      })}
      {draftSelectedNames.length > 0 && (
        <>
          <ActionMenuSeparator />
          <ActionMenuItem
            onSelect={(event) => {
              event.preventDefault();
              if (disabled) {
                return;
              }
              clearAll();
            }}
            className={cn(MENU_ITEM_CLASSES, readOnlyItemClassName)}
          >
            {t('DocumentsCard.table.topic.clear')}
          </ActionMenuItem>
        </>
      )}
    </BadgeSelect>
  );
};
