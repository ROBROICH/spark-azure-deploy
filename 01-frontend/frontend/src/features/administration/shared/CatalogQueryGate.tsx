import { Button } from '@/features/ui/button/Button';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { getCatalogApiErrorMessage } from '../catalog/catalogApiError';
import { catalogUsecaseQueryOptions } from '../catalog/usecaseQueries';
import type { Usecase } from '../data/usecaseApi';

export type CatalogQueryGateProps = {
  headingId: string;
  title: string;
  projectTypeId: string;
  missing: ReactNode;
  children: (usecase: Usecase) => ReactNode;
};

const CatalogSectionSkeleton = () => (
  <div
    className="overflow-clip rounded-lg border border-border-primary"
    {...skeletonListProps}
  >
    {Array.from({ length: 4 }).map((_, index) => (
      <div
        key={index}
        className="border-b border-border-primary px-3 py-[11px] last:border-b-0"
      >
        <Skeleton className="h-[18px] w-48" aria-hidden />
      </div>
    ))}
  </div>
);

/**
 * Shares the catalog usecase query across administration editors and switches
 * between loading, query error, missing-catalog, and ready children.
 *
 * @param props Section heading, selected project type, missing-catalog UI, and ready renderer.
 * @returns The gated catalog section shell.
 */
export function CatalogQueryGate(props: CatalogQueryGateProps) {
  const { headingId, title, projectTypeId, missing, children } = props;
  const { t } = useTranslation('Administration');
  const catalogQuery = useQuery(catalogUsecaseQueryOptions(projectTypeId));

  if (catalogQuery.isPending) {
    return (
      <section className="flex flex-col gap-4" aria-labelledby={headingId}>
        <h2
          id={headingId}
          className="text-base font-medium tracking-tight text-text-primary"
        >
          {title}
        </h2>
        <div role="status" aria-label={t('catalog.loading')}>
          <CatalogSectionSkeleton />
        </div>
      </section>
    );
  }

  if (catalogQuery.isError) {
    return (
      <section className="flex flex-col gap-4" aria-labelledby={headingId}>
        <h2
          id={headingId}
          className="text-base font-medium tracking-tight text-text-primary"
        >
          {title}
        </h2>
        <div className="flex flex-col items-start gap-3 rounded-lg border-[0.5px] border-border-secondary bg-neutral-white p-3">
          <p role="alert" className="text-sm text-text-secondary">
            {getCatalogApiErrorMessage(catalogQuery.error) ??
              t('catalog.loadError')}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void catalogQuery.refetch();
            }}
          >
            {t('catalog.retry')}
          </Button>
        </div>
      </section>
    );
  }

  if (catalogQuery.data.kind === 'missing') {
    return (
      <section className="flex flex-col gap-4" aria-labelledby={headingId}>
        <h2
          id={headingId}
          className="text-base font-medium tracking-tight text-text-primary"
        >
          {title}
        </h2>
        {missing}
      </section>
    );
  }

  return children(catalogQuery.data.usecase);
}
