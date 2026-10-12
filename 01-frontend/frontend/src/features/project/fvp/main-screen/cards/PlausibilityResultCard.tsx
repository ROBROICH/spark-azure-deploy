import { usePlausibilityContradictionsSummary } from '@/features/project/fvp/data/plausibility/usePlausibilityContradictionsSummary';
import { CollectionErrorAlert } from '@/features/project/fvp/main-screen/read-status/CollectionErrorAlert';
import { retryPlausibilityReads } from '@/features/project/fvp/data/fvpResultReads';
import { Card } from '@/features/ui/card/Card';
import { InfoTooltip } from '@/features/ui/info-tooltip/InfoTooltip';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { resultCardOutlinedActionClass } from './resultCardActions';
import { ResultCardSkeleton } from './ResultCardSkeleton';
import { ResultCardStatusFallback } from './ResultCardStatusFallback';
import { StatusProgressRing } from './StatusProgressRing';

type PlausibilityResultCardProps = {
  projectId: string;
  statusAddon?: ReactNode;
};

type CounterTileProps = {
  count: number;
  label: string;
};

const CounterTile = (props: CounterTileProps) => {
  const { count, label } = props;
  return (
    <div className="flex h-28 flex-1 flex-col items-center justify-center gap-3 rounded-xl border-[0.5px] border-slate-400 bg-neutral-white p-2 text-center text-slate-600">
      <span className="text-lg leading-6 font-medium tracking-[-0.01em]">
        {count}
      </span>
      <span className="text-xs leading-[14px] font-medium tracking-[0.02em]">
        {label}
      </span>
    </div>
  );
};

export const PlausibilityResultCard = (props: PlausibilityResultCardProps) => {
  const { projectId, statusAddon } = props;
  const { t } = useTranslation('FormalCompletenessCheck');
  const { summary, isLoading, isError } =
    usePlausibilityContradictionsSummary(projectId);

  if (isLoading) {
    return <ResultCardSkeleton statusAddon={statusAddon} />;
  }

  if (isError) {
    return (
      <ResultCardStatusFallback statusAddon={statusAddon}>
        <CollectionErrorAlert
          onRetry={() => retryPlausibilityReads(projectId)}
        />
      </ResultCardStatusFallback>
    );
  }

  const processedCount = summary.total - summary.open;
  const canViewContradictions = summary.total > 0;
  const statusText = t('redesign.plausibilityCard.status.progress', {
    processed: processedCount,
    total: summary.total,
  });

  // This card intentionally hand-builds its shell instead of reusing
  // `ResultCard`: the plausibility result is a counter-tile summary plus a view
  // link, not the hint-list layout `ResultCard` is shaped around. Extracting a
  // shared shell would force `ResultCard` to support two divergent bodies, so
  // the small amount of repeated chrome is kept here on purpose.
  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden rounded-2xl bg-bg-secondary p-0 shadow-none">
      <div className="flex items-center gap-2 border-b border-border-secondary px-4 py-4">
        <StatusProgressRing processed={processedCount} total={summary.total} />
        <span className="text-xs leading-4 font-medium tracking-[0.02em] text-green-900">
          {statusText}
        </span>
        {statusAddon ? (
          <span className="ml-auto flex shrink-0">{statusAddon}</span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <div className="flex h-8 items-center justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base leading-5 font-medium tracking-[-0.01em] text-text-primary">
              {t('redesign.plausibilityCard.title')}
            </h3>
            <InfoTooltip
              ariaLabel={t('redesign.plausibilityCard.infoLabel')}
              content={t('redesign.plausibilityCard.info')}
              className="inline-flex size-5 text-text-secondary"
              iconClassName="size-5"
            />
          </div>
          <p className="text-sm leading-[18px] tracking-[-0.01em] text-text-secondary">
            {t('redesign.plausibilityCard.description')}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs leading-4 font-medium tracking-[0.02em] text-text-secondary">
            {t('redesign.plausibilityCard.hintsHeading', {
              count: summary.total,
            })}
          </span>
          <div className="flex gap-2">
            <CounterTile
              count={summary.open}
              label={t('redesign.plausibilityCard.counters.open')}
            />
            <CounterTile
              count={summary.onRequestList}
              label={t('redesign.plausibilityCard.counters.requested')}
            />
            <CounterTile
              count={summary.ignored}
              label={t('redesign.plausibilityCard.counters.irrelevant')}
            />
          </div>
        </div>

        <div className="mt-auto flex items-center justify-start">
          {canViewContradictions ? (
            <Link
              to="/verfahren/$verfahrenId/fvp/pp"
              params={{ verfahrenId: projectId }}
              // Reset documents-tab search so an open preview or active
              // search/filter does not leak into and mis-render the PP tab.
              search={() => ({})}
              className={resultCardOutlinedActionClass}
            >
              {t('redesign.plausibilityCard.viewContradictions')}
            </Link>
          ) : (
            <button
              type="button"
              className={resultCardOutlinedActionClass}
              disabled
            >
              {t('redesign.plausibilityCard.viewContradictions')}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
};
