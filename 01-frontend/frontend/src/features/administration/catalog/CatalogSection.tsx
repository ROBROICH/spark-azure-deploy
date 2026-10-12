import { projectTypesCollection } from '@/features/project/data/project-types/projectTypes.collection';
import { Button } from '@/features/ui/button/Button';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from '@tanstack/react-db';
import { useTranslation } from 'react-i18next';

import { getCatalogApiErrorMessage } from './catalogApiError';
import { CatalogDraftSection } from './CatalogDraftSection';
import { CatalogInitCard } from './CatalogInitCard';
import { catalogUsecaseQueryOptions } from './usecaseQueries';
import { useCreateUsecase } from './useCreateUsecase';

export type CatalogSectionProps = {
  projectTypeId: string;
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
 * Loads the catalog for the selected project type and switches between loading,
 * query error, the 404 init card, and the shared gesetzesgrundlage draft.
 *
 * @param props Selected project type id (also the usecase id).
 * @returns The catalog editor region for that project type.
 */
export function CatalogSection(props: CatalogSectionProps) {
  const { projectTypeId } = props;
  const { t } = useTranslation('Administration');
  const { data: projectTypes } = useLiveQuery((q) =>
    q.from({ projectTypes: projectTypesCollection }),
  );
  const selectedProjectType = projectTypes.find(
    (projectType) => projectType.id === projectTypeId,
  );
  const projectTypeName = selectedProjectType?.name ?? projectTypeId;
  const catalogQuery = useQuery(catalogUsecaseQueryOptions(projectTypeId));
  const createUsecase = useCreateUsecase();
  const createError = createUsecase.error
    ? (getCatalogApiErrorMessage(createUsecase.error) ??
      t('catalog.toasts.createError'))
    : null;

  if (catalogQuery.isPending) {
    return (
      <section
        className="flex flex-col gap-4"
        aria-labelledby="catalog-heading"
      >
        <h2
          id="catalog-heading"
          className="text-base font-medium tracking-tight text-text-primary"
        >
          {t('catalog.title')}
        </h2>
        <div role="status" aria-label={t('catalog.loading')}>
          <CatalogSectionSkeleton />
        </div>
      </section>
    );
  }

  if (catalogQuery.isError) {
    return (
      <section
        className="flex flex-col gap-4"
        aria-labelledby="catalog-heading"
      >
        <h2
          id="catalog-heading"
          className="text-base font-medium tracking-tight text-text-primary"
        >
          {t('catalog.title')}
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
      <CatalogInitCard
        projectTypeName={projectTypeName}
        isPending={createUsecase.isPending}
        persistError={createError}
        onCreate={() => {
          void createUsecase
            .mutateAsync({
              projectTypeId,
              projectTypeName,
            })
            .catch(() => undefined);
        }}
      />
    );
  }

  return (
    <CatalogDraftSection
      key={projectTypeId}
      usecase={catalogQuery.data.usecase}
    />
  );
}
