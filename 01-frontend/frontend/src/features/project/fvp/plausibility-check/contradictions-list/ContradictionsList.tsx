import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import type { ContradictionListItem } from '../data/read-model/useContradictions';
import { ContradictionCard } from './ContradictionCard';
import { ContradictionsListSkeleton } from './ContradictionsListSkeleton';

type ContradictionsListProps = {
  contradictions: ContradictionListItem[];
  hasFilters: boolean;
  isLoading: boolean;
};

export const ContradictionsList = (props: ContradictionsListProps) => {
  const { contradictions, hasFilters, isLoading } = props;

  if (isLoading) {
    return <ContradictionsListSkeleton />;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {contradictions.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <div className="flex flex-col gap-4">
          {contradictions.map((contradiction, index) => (
            <Fragment key={contradiction.id}>
              <ContradictionCard contradiction={contradiction} index={index} />
              {index < contradictions.length - 1 && (
                <div className="h-0 w-full border-t-[0.5px] border-slate-300" />
              )}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

type EmptyStateProps = {
  hasFilters: boolean;
};

function EmptyState(props: EmptyStateProps) {
  const { hasFilters } = props;
  const { t } = useTranslation('PlausibilityCheck');

  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <div className="text-muted-foreground text-center">
        <p className="font-medium">
          {hasFilters
            ? t('ContradictionsList.emptyState.noResults')
            : t('ContradictionsList.emptyState.noHints')}
        </p>
        <p className="text-sm">
          {hasFilters
            ? t('ContradictionsList.emptyState.noResultsDescription')
            : t('ContradictionsList.emptyState.noHintsDescription')}
        </p>
      </div>
    </div>
  );
}
