import { Button } from '@/features/ui/button/Button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/features/ui/pagination/Pagination';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type AuditLogPaginationProps = {
  isLoading: boolean;
  limit: number;
  loadedItemCount: number;
  offset: number;
  total: number | undefined;
  onOffsetChange: (offset: number) => void;
};

const AuditLogPaginationSkeleton = () => (
  <div
    className="mt-6 flex items-center justify-between border-t border-neutral-200 pt-4"
    aria-hidden="true"
    {...skeletonListProps}
  >
    <Skeleton className="h-4 w-52 text-neutral-200" />
    <div className="flex items-center gap-1">
      <Skeleton className="h-9 w-24 text-neutral-200" />
      <Skeleton className="h-9 w-28 text-neutral-200" />
      <Skeleton className="h-9 w-20 text-neutral-200" />
    </div>
  </div>
);

/**
 * Provides same-panel pagination commands while the parent owns the route-search
 * offset update for parent and drilldown lists.
 *
 * @param props Pagination metadata and the parent-owned offset change command.
 * @returns Audit log pagination status, page picker, and previous/next controls.
 */
export const AuditLogPagination = (props: AuditLogPaginationProps) => {
  const { isLoading, limit, loadedItemCount, offset, total, onOffsetChange } =
    props;
  const { t } = useTranslation('AuditLog');
  const hasPreviousPage = offset > 0;
  const hasNextPage =
    total === undefined ? loadedItemCount === limit : offset + limit < total;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages =
    total === undefined ? undefined : Math.max(1, Math.ceil(total / limit));
  const pageOptions =
    totalPages === undefined
      ? []
      : Array.from({ length: totalPages }, (_, index) => index + 1);

  if (isLoading) {
    return <AuditLogPaginationSkeleton />;
  }

  const handlePrevious = () => {
    if (!hasPreviousPage) {
      return;
    }

    onOffsetChange(Math.max(0, offset - limit));
  };

  const handleNext = () => {
    if (!hasNextPage) {
      return;
    }

    onOffsetChange(offset + limit);
  };

  const handlePageChange = (pageValue: string) => {
    const nextPage = Number.parseInt(pageValue, 10);
    if (Number.isNaN(nextPage)) {
      return;
    }

    onOffsetChange((nextPage - 1) * limit);
  };

  return (
    <div className="mt-6 flex items-center justify-between border-t border-neutral-200 pt-4">
      <span className="text-sm text-neutral-600">
        {total === undefined
          ? t('pagination.loaded', { count: loadedItemCount })
          : t('pagination.summary', {
              count: loadedItemCount,
              offset: total === 0 ? 0 : offset + 1,
              total,
            })}
      </span>
      <Pagination aria-label={t('pagination.label')} className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <Button
              variant="ghost"
              size="default"
              aria-label={t('pagination.previousPage')}
              disabled={!hasPreviousPage}
              onClick={handlePrevious}
            >
              <ChevronLeftIcon className="size-4" />
              {t('pagination.previous')}
            </Button>
          </PaginationItem>
          {totalPages ? (
            <PaginationItem>
              <div className="flex items-center gap-2 text-sm text-neutral-600">
                <span>{t('pagination.pageLabel')}</span>
                <SelectMenu
                  ariaLabel={t('pagination.pageSelect')}
                  items={pageOptions.map((page) => ({
                    value: String(page),
                    label: t('pagination.pageOption', { page }),
                  }))}
                  value={String(currentPage)}
                  onChange={handlePageChange}
                  triggerClassName="h-9 w-16"
                />
                <span>{t('pagination.pageTotal', { total: totalPages })}</span>
              </div>
            </PaginationItem>
          ) : null}
          <PaginationItem>
            <Button
              variant="ghost"
              size="default"
              aria-label={t('pagination.nextPage')}
              disabled={!hasNextPage}
              onClick={handleNext}
            >
              {t('pagination.next')}
              <ChevronRightIcon className="size-4" />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};
