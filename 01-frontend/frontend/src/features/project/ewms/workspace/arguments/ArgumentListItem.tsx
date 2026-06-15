import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { AiSuggestionBadge } from '@/features/ui/ai-suggestion-badge/AiSuggestionBadge';
import {
  ArgumentCard,
  ArgumentCardBadge,
  ArgumentCardBody,
  ArgumentCardFooter,
  ArgumentCardHeader,
  ArgumentCardMenu,
  ArgumentCardMetadata,
  ArgumentCardTags,
  ArgumentCardTitle,
} from '@/features/ui/cards/argument-card/ArgumentCard';
import { Button } from '@/features/ui/button/Button';
import { SplitButton } from '@/features/ui/button/SplitButton';
import type { SelectMenuItem } from '@/features/ui/select-menu/SelectMenu';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';
import { cn } from '@/features/ui/style/cn';
import { Link } from '@tanstack/react-router';
import { CheckCircle2, CircleDashed, Mail, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArgumentClassificationReviewActions } from '../../shared-ui/ArgumentClassificationReviewActions';
import type {
  EwmsArgumentNode,
  EwmsBeteiligungsEingang,
  EwmsTopicNode,
} from '../../data/ewms.nodes';
import {
  getEwmsSubtopicIdForArgument,
  getEwmsTopicIdForArgument,
  isEwmsArgumentApproved,
  isEwmsArgumentTopicReviewOpen,
  isEwmsVisibleTopic,
  resolveEwmsReferenceId,
} from '../../data/ewms.nodes';
import { useEwmsSubtopics } from '../EwmsSubtopicsContext';
import { ArgumentDeleteDialog } from './ArgumentDeleteDialog';

const metadataTextClasses =
  'flex items-center gap-2 pr-1 text-[11px] leading-[1.27] font-medium tracking-[0.02em] text-slate-600';
const shouldShowArgumentCardSenderMetadata = (): boolean => false;
const hasTextValue = (value: string | null) =>
  value !== null && value.trim() !== '';

export const getTopicItems = (topics: EwmsTopicNode[]): SelectMenuItem[] =>
  topics.filter(isEwmsVisibleTopic).map((topic) => ({
    value: topic.id,
    label: topic.name,
  }));

type ArgumentStatusBadgeProps = {
  checked: boolean;
  children: ReactNode;
};

const ArgumentStatusBadge = (props: ArgumentStatusBadgeProps) => {
  const { checked, children } = props;
  const Icon = checked ? CheckCircle2 : CircleDashed;

  return (
    <span
      data-slot="argument-status-badge"
      data-state={checked ? 'checked' : 'unchecked'}
      className={
        checked
          ? 'inline-flex h-6 items-center gap-1 rounded border-[0.5px] border-green-500 bg-green-50 px-1.5 text-[11px] leading-[14px] font-medium tracking-[0.02em] text-green-900'
          : 'inline-flex h-6 items-center gap-1 rounded border-[0.5px] border-slate-300 bg-white px-1.5 text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-600'
      }
    >
      <Icon aria-hidden="true" className="size-4" />
      {children}
    </span>
  );
};

type ArgumentListItemProps = {
  argument: EwmsArgumentNode;
  entry: EwmsBeteiligungsEingang | undefined;
  topicItems: SelectMenuItem[];
  onDeleteArgument: (argument: EwmsArgumentNode) => void;
  onReviewArgumentClassification: (
    argument: EwmsArgumentNode,
    isAccepted: boolean,
  ) => void;
  onSelectArgument?: (argumentId: string, trigger: HTMLElement) => void;
  onToggleArgument: (argument: EwmsArgumentNode) => void;
  onUpdateArgumentSubtopic: (
    argument: EwmsArgumentNode,
    subtopicId: string,
  ) => void;
  onUpdateArgumentTopic: (argument: EwmsArgumentNode, topicId: string) => void;
};

/**
 * Owns one argument card's controls while delegating modal confirmation UI.
 */
export const ArgumentListItem = (props: ArgumentListItemProps) => {
  const {
    argument,
    entry,
    topicItems,
    onDeleteArgument,
    onReviewArgumentClassification,
    onSelectArgument,
    onToggleArgument,
    onUpdateArgumentSubtopic,
    onUpdateArgumentTopic,
  } = props;
  const { t } = useTranslation('Ewms');
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  // eslint-disable-next-line no-restricted-syntax -- delete confirmation is ephemeral card-local dialog state.
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const referenceId = resolveEwmsReferenceId(argument);
  const senderName = entry?.filename?.trim() || t('arguments.unknownSender');
  const topicId = getEwmsTopicIdForArgument(argument);
  const subtopicId = getEwmsSubtopicIdForArgument(argument);
  const isApproved = isEwmsArgumentApproved(argument);
  const isTopicReviewOpen = isEwmsArgumentTopicReviewOpen(argument);
  const titleClassName =
    !isTopicReviewOpen && !isApproved ? 'bg-none text-slate-700' : undefined;
  const { getSubtopicItemsForTopic } = useEwmsSubtopics();
  const subtopicItems = getSubtopicItemsForTopic(topicId);
  const handleConfirmDelete = () => {
    if (!canMutateProject) {
      return;
    }

    onDeleteArgument(argument);
    setIsDeleteDialogOpen(false);
  };

  return (
    <div role="listitem">
      <ArgumentCard
        variant={isApproved ? 'success' : 'default'}
        className={
          isTopicReviewOpen
            ? 'border-purple-400 shadow-[0px_0px_0px_1px_rgba(168,85,247,0.2),0px_4px_16px_rgba(88,28,135,0.12)]'
            : undefined
        }
      >
        <ArgumentCardHeader>
          {isTopicReviewOpen && (
            <ArgumentCardBadge>
              <AiSuggestionBadge iconOnly />
            </ArgumentCardBadge>
          )}
          {onSelectArgument ? (
            <Link
              from="/verfahren/$verfahrenId/ewms"
              to="/verfahren/$verfahrenId/ewms"
              params={(prev) => prev}
              search={(prev) => ({ ...prev, selectedArgumentId: argument.id })}
              resetScroll={false}
              onClick={(e) => onSelectArgument(argument.id, e.currentTarget)}
              className="focus-ring min-w-0 flex-1 rounded text-left"
            >
              <ArgumentCardTitle className={titleClassName}>
                {referenceId}
              </ArgumentCardTitle>
            </Link>
          ) : (
            <ArgumentCardTitle className={titleClassName}>
              {referenceId}
            </ArgumentCardTitle>
          )}
          <ArgumentCardMenu>
            <Button
              type="button"
              variant="ghost-light"
              size="xs"
              iconOnly
              className="hover:text-error-800 active:text-error-900"
              disabled={!canMutateProject}
              aria-label={t('arguments.deleteArgumentLabel', { referenceId })}
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </ArgumentCardMenu>
        </ArgumentCardHeader>

        <ArgumentCardBody>{argument.text}</ArgumentCardBody>

        {shouldShowArgumentCardSenderMetadata() && (
          <ArgumentCardMetadata>
            <span className={metadataTextClasses}>
              <Mail className="size-4" aria-hidden="true" />
              {senderName}
            </span>
          </ArgumentCardMetadata>
        )}

        <ArgumentCardFooter className="px-2 pb-2">
          <ArgumentCardTags className="!ml-0 w-full min-w-0 flex-1 flex-col items-start gap-3">
            <div
              data-slot="argument-classification-controls"
              className={cn(
                'inline-flex w-fit max-w-full min-w-0 items-center gap-2 self-start',
                isTopicReviewOpen && 'rounded-lg bg-slate-100 p-1',
              )}
            >
              <SelectMenu
                variant="badge"
                items={topicItems}
                value={topicId ?? ''}
                placeholder={t('arguments.unassignedTopic')}
                ariaLabel={t('arguments.topicLabel', { referenceId })}
                triggerClassName={
                  isTopicReviewOpen
                    ? 'max-w-72 border-purple-500'
                    : cn('max-w-full', isApproved && 'border-green-500')
                }
                valueClassName={
                  isTopicReviewOpen ? 'text-purple-700' : undefined
                }
                disabled={!canMutateProject}
                onChange={(nextTopicId) =>
                  onUpdateArgumentTopic(argument, nextTopicId)
                }
              />
              <SelectMenu
                variant="badge"
                items={subtopicItems}
                value={subtopicId ?? ''}
                placeholder={t('arguments.unassignedSubtopic')}
                ariaLabel={t('arguments.subtopicLabel', { referenceId })}
                triggerClassName={
                  isTopicReviewOpen
                    ? 'max-w-72 border-purple-500'
                    : cn(
                        'w-full max-w-full sm:w-auto sm:max-w-96',
                        isApproved && 'border-green-500',
                      )
                }
                valueClassName={
                  isTopicReviewOpen ? 'text-purple-700' : undefined
                }
                disabled={!canMutateProject || subtopicItems.length === 0}
                onChange={(nextSubtopicId) =>
                  onUpdateArgumentSubtopic(argument, nextSubtopicId)
                }
              />
              {isTopicReviewOpen && (
                <ArgumentClassificationReviewActions
                  referenceId={referenceId}
                  disabled={!canMutateProject}
                  onAccept={() =>
                    onReviewArgumentClassification(argument, true)
                  }
                  onReject={() =>
                    onReviewArgumentClassification(argument, false)
                  }
                />
              )}
            </div>
            <div
              data-slot="argument-status-row"
              className="flex w-full min-w-0 flex-wrap items-center gap-1"
            >
              <ArgumentStatusBadge checked={hasTextValue(argument.erwiderung)}>
                {t('topicClassification.erwiderung')}
              </ArgumentStatusBadge>
              <ArgumentStatusBadge checked={hasTextValue(argument.einordnung)}>
                {t('topicClassification.einordnung')}
              </ArgumentStatusBadge>
              <ArgumentStatusBadge checked={argument.in_vae}>
                {t('arguments.inResolutionBadge')}
              </ArgumentStatusBadge>
              {argument.is_valid_argument === false && (
                <span className="rounded border border-amber-300 bg-amber-50 px-2 py-[3px] text-[11px] leading-[14px] font-medium text-amber-900">
                  {t('arguments.invalidBadge')}
                </span>
              )}
              <SplitButton
                checked={isApproved}
                onCheckedChange={() => onToggleArgument(argument)}
                disabled={!canMutateProject}
                size="sm"
                checkedLabel={t('arguments.approved')}
                uncheckedLabel={t('arguments.approve')}
                className="ml-auto shrink-0"
                aria-label={
                  isApproved
                    ? t('arguments.approvedArgumentLabel', { referenceId })
                    : t('arguments.approveArgumentLabel', { referenceId })
                }
              />
            </div>
          </ArgumentCardTags>
        </ArgumentCardFooter>
      </ArgumentCard>
      <ArgumentDeleteDialog
        canDelete={canMutateProject}
        isOpen={isDeleteDialogOpen}
        referenceId={referenceId}
        onConfirm={handleConfirmDelete}
        onOpenChange={setIsDeleteDialogOpen}
      />
    </div>
  );
};
