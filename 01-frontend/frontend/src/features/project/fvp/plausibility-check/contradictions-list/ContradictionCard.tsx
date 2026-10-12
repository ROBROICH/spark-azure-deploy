import type { PlausibilityNoteStatus } from '@/api-clients/backend';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/features/ui/collapsible/Collapsible';
import { AiSparklesChip } from '@/features/ui/ai/AiSparklesChip';
import { InfoTooltip } from '@/features/ui/info-tooltip/InfoTooltip';
import {
  StatusBadge,
  type StatusBadgeVariant,
} from '@/features/ui/status-badge/StatusBadge';
import { cn } from '@/features/ui/style/cn';
import { ContradictionCardExpanded } from '../contradiction-card-expanded/ContradictionCardExpanded';
import {
  UNCERTAIN_SENSITIVITY_THRESHOLD,
  getNormalizedRating,
} from '../data/filtering/contradictionFilters';
import type { ContradictionListItem } from '../data/read-model/useContradictions';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/pp/');

type ContradictionCardProps = {
  contradiction: ContradictionListItem;
  index: number;
};

const STATUS_BADGE_VARIANT = {
  OPEN: 'default',
  IGNORED: 'default',
  RESOLVED: 'success',
} satisfies Record<PlausibilityNoteStatus, StatusBadgeVariant>;

/**
 * Binds one contradiction row to the route-backed expanded state without
 * subscribing every row to unrelated search params.
 */
export const ContradictionCard = (props: ContradictionCardProps) => {
  const { contradiction, index } = props;
  const { t } = useTranslation('PlausibilityCheck');
  const expandedContradictionId = route.useSearch({
    select: (searchState) => searchState.expandedContradictionId,
  });
  const navigate = useNavigate();

  const isExpanded = expandedContradictionId === contradiction.id;
  const isIgnored = contradiction.status === 'IGNORED';
  const statusVariant = contradiction.isOnRequestList
    ? 'warning'
    : STATUS_BADGE_VARIANT[contradiction.status];
  const statusLabel = contradiction.isOnRequestList
    ? t('redesign.status.requested')
    : t(`redesign.status.${contradiction.status.toLowerCase()}`);
  const referenceLabel = t('redesign.referenceId', {
    index: String(index + 1).padStart(4, '0'),
  });
  const toggleExpanded = () => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        expandedContradictionId: isExpanded ? undefined : contradiction.id,
        leftOccurrenceIndex: undefined,
        rightOccurrenceIndex: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const rowTextColorClassName = isExpanded
    ? 'text-brand-950'
    : 'text-slate-600';
  const rowTitle = contradiction.title?.trim() || t('redesign.rowTitle');
  const rowDescription = contradiction.description.trim();
  const normalizedRating = getNormalizedRating(contradiction);
  const isUncertainFinding =
    Number.isFinite(normalizedRating) &&
    normalizedRating < UNCERTAIN_SENSITIVITY_THRESHOLD;
  const weaklySupportedLabel = t('redesign.weaklySupported');

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={toggleExpanded}
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="relative flex min-h-8 w-full items-start gap-2 p-1 text-left">
        {isUncertainFinding ? (
          <InfoTooltip
            icon={TriangleAlert}
            ariaLabel={weaklySupportedLabel}
            content={weaklySupportedLabel}
            className="absolute top-6 left-1 z-10 size-5 text-warning-600"
            iconClassName="size-3.5"
          />
        ) : null}
        <CollapsibleTrigger
          aria-label={`${rowTitle} ${referenceLabel}, ${statusLabel}: ${rowDescription}`}
          className={cn(
            'focus-ring flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded text-left',
            isIgnored && !isExpanded && 'opacity-50',
          )}
        >
          <AiSparklesChip
            size="sm"
            className="-mt-px size-5"
            iconClassName="size-3.5"
            aria-hidden="true"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'truncate text-[13px] leading-[18px] font-medium',
                  rowTextColorClassName,
                )}
              >
                {rowTitle}
              </span>
              <span
                className={cn(
                  'shrink-0 text-[11px] leading-[14px] tracking-[0.02em]',
                  rowTextColorClassName,
                )}
              >
                {referenceLabel}
              </span>
            </div>
            <span className="text-[12px] leading-[16px] wrap-anywhere text-slate-600">
              {rowDescription}
            </span>
          </div>
          <span className="ml-auto flex h-[18px] shrink-0 items-center gap-2">
            <StatusBadge variant={statusVariant} size="sm">
              {statusLabel}
            </StatusBadge>
            {isExpanded ? (
              <ChevronDown
                className="size-4 shrink-0 text-slate-600"
                aria-hidden="true"
              />
            ) : (
              <ChevronRight
                className="size-4 shrink-0 text-slate-600"
                aria-hidden="true"
              />
            )}
          </span>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <ContradictionCardExpanded contradiction={contradiction} />
      </CollapsibleContent>
    </Collapsible>
  );
};
