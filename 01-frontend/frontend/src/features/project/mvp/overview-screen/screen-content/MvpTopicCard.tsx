import type { NodePayloadByType } from '@/db/nodes/types';
import type { TopicWritePermissionState } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import { TopicWritePermissionBadge } from '@/features/access-control/topic-permissions/TopicWritePermissionBadge';
import { AggregatedLawChangeIndicatorView } from '@/features/project/law-changes/ui/AggregatedLawChangeIndicator';
import type { LawChangeRecord } from '@/features/project/law-changes/data/lawChanges.types';
import { AiStatusChip } from '@/features/ui/ai/AiStatusChip';
import { StatusBadge } from '@/features/ui/status-badge/StatusBadge';
import { VersionChangedDocumentsBadge } from '@/features/ui/version-changed-documents-badge/VersionChangedDocumentsBadge';
import { cn } from '@/features/ui/style/cn';
import { Link, getRouteApi } from '@tanstack/react-router';
import { useId, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { CARD_COLORS_BY_STATUS } from '../mvpCardColors';
import { deriveTopicProgress } from '../overview.logic';
import { AvatarHeader } from './AvatarHeader';

type MvpTopicCardProps = {
  topic: NodePayloadByType<'topic'>;
  topicNorms: NodePayloadByType<'topic_norm'>[];
  documentCount: number;
  canChangeAssignedUsers: boolean;
  hasInternalFundstelle: boolean;
  lawChanges: LawChangeRecord[];
  topicWritePermission: TopicWritePermissionState;
  hasNeedsRevisionNorms?: boolean;
  onChangeAssignedUsers: (topicId: string, assignedUserIds: string[]) => void;
};

const route = getRouteApi('/verfahren/$verfahrenId/mvp/');
const TOPIC_CARD_INTERACTIVE_DATA_ATTRIBUTE = 'true';
const TOPIC_STATUS_BADGE_VARIANT = {
  complete: 'success',
  inProgress: 'neutral',
  open: 'default',
} satisfies Record<
  ReturnType<typeof deriveTopicProgress>['status'],
  ComponentProps<typeof StatusBadge>['variant']
>;

/**
 * Keeps the full-card detail link behind assignment and status controls so
 * nested interactive affordances remain reachable without losing card-level
 * navigation.
 */
export const MvpTopicCard = (props: MvpTopicCardProps) => {
  const { t } = useTranslation('MaterialCompletenessCheck');
  const {
    topic,
    topicNorms,
    canChangeAssignedUsers,
    documentCount,
    hasInternalFundstelle,
    hasNeedsRevisionNorms,
    lawChanges,
    topicWritePermission,
    onChangeAssignedUsers,
  } = props;
  const { verfahrenId } = route.useParams();
  const cardTitleId = useId();
  const cardMetricsId = useId();
  const cardStatusId = useId();
  const { checkedNormCount, totalNormCount, status } =
    deriveTopicProgress(topicNorms);
  const topicLawChangeNorms = topicNorms.map((topicNorm) => ({
    jurabk: topicNorm.jurabk,
    paragraphNr: topicNorm.paragraphNr,
  }));

  const colors = CARD_COLORS_BY_STATUS[status];
  return (
    <div
      className={cn(
        'relative flex min-w-60 cursor-pointer flex-col rounded-lg border shadow-sm transition-shadow hover:shadow-md',
        colors.cardBg,
        colors.cardBorder,
      )}
    >
      <Link
        to="/verfahren/$verfahrenId/mvp/$topicName"
        params={{ verfahrenId, topicName: topic.id }}
        search={(prev) => ({
          search: prev.search,
          topicAssigneeIds: prev.topicAssigneeIds,
          topicSort: prev.topicSort,
          topicStatus: prev.topicStatus,
        })}
        resetScroll={false}
        className="focus-ring absolute inset-0 z-0 rounded-lg"
        aria-label={topic.name}
        aria-describedby={cardStatusId}
      />
      <div
        className={cn(
          'pointer-events-none relative z-10 flex min-h-10 items-center justify-between gap-2 overflow-hidden rounded-t-lg p-1',
          colors.headerBg,
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {!hasInternalFundstelle ? (
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white">
              <span
                className="text-sm font-bold text-[#1E1D49]"
                aria-hidden="true"
              >
                §
              </span>
            </div>
          ) : null}
          {hasInternalFundstelle ? (
            <span
              data-topic-card-interactive={
                TOPIC_CARD_INTERACTIVE_DATA_ATTRIBUTE
              }
              className="pointer-events-auto inline-flex"
            >
              <AiStatusChip
                ariaLabel={t('TopicWorkflow.overviewCard.aiSupport.label')}
                tooltip={t('TopicWorkflow.overviewCard.aiSupport.description')}
              />
            </span>
          ) : null}
          <span
            data-topic-card-interactive={TOPIC_CARD_INTERACTIVE_DATA_ATTRIBUTE}
            className="pointer-events-auto inline-flex"
          >
            <TopicWritePermissionBadge
              permission={topicWritePermission}
              variant="small"
            />
          </span>
          <span
            data-topic-card-interactive={TOPIC_CARD_INTERACTIVE_DATA_ATTRIBUTE}
            className="pointer-events-auto inline-flex"
          >
            <AggregatedLawChangeIndicatorView
              lawChanges={lawChanges}
              norms={topicLawChangeNorms}
            />
          </span>
        </div>

        <div
          data-topic-card-interactive={TOPIC_CARD_INTERACTIVE_DATA_ATTRIBUTE}
          className="pointer-events-auto flex min-w-0 shrink-0 items-center justify-end"
        >
          <AvatarHeader
            assignedUserIds={topic.mvpAssignees}
            disabled={!canChangeAssignedUsers}
            onChange={(assignedUserIds) =>
              onChangeAssignedUsers(topic.id, assignedUserIds)
            }
          />
        </div>
      </div>

      <div className="pointer-events-none relative z-10 flex flex-1 flex-col gap-2 px-4 py-3">
        <h3
          id={cardTitleId}
          className={cn('text-body-sm font-medium', colors.textColor)}
        >
          {topic.name}
        </h3>

        <div
          id={cardMetricsId}
          className={cn(
            'space-y-1 text-[11px] font-medium tracking-wide',
            colors.metricColor,
          )}
        >
          <p>
            {t('TopicWorkflow.overviewCard.progress.documents', {
              count: documentCount,
              total: documentCount,
            })}
          </p>
          <p>
            {t('TopicWorkflow.overviewCard.progress.norms', {
              checked: checkedNormCount,
              total: totalNormCount,
            })}
          </p>
        </div>
      </div>

      <div
        className={cn(
          'pointer-events-none relative z-10 flex items-end justify-between gap-2 overflow-hidden rounded-b-lg p-1',
          colors.cardBg,
        )}
      >
        <span id={cardStatusId}>
          <StatusBadge variant={TOPIC_STATUS_BADGE_VARIANT[status]}>
            {t(`TopicWorkflow.overviewCard.status.${status}`)}
          </StatusBadge>
        </span>
        {hasNeedsRevisionNorms ? (
          <VersionChangedDocumentsBadge
            label={t('TopicWorkflow.overviewCard.alerts.mehrere_aenderungen')}
          />
        ) : null}
      </div>
    </div>
  );
};
