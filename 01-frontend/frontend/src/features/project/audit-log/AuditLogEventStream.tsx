import { Button } from '@/features/ui/button/Button';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { cn } from '@/features/ui/style/cn';
import { useTranslation } from 'react-i18next';
import { getAuditLogHistoryItemKey } from './data/auditLogHistory.collection';
import { AuditLogEventCard } from './AuditLogEventCard';
import type { AuditLogEventGroup } from './AuditLogTypes';

const AUDIT_LOG_EVENT_SKELETON_COUNT = 3;

export function AuditLogEventStream(props: {
  groupedItems: AuditLogEventGroup[];
  isDrilldown: boolean;
  isError: boolean;
  isLoading: boolean;
  onOpenGroupLinkClick: (groupKey: string) => void;
  onRetry: () => void;
}) {
  const {
    groupedItems,
    isDrilldown,
    isError,
    isLoading,
    onOpenGroupLinkClick,
    onRetry,
  } = props;
  const { t } = useTranslation('AuditLog');

  if (isLoading) {
    return <AuditLogEventStreamSkeleton isDrilldown={isDrilldown} />;
  }

  if (isError) {
    return (
      <div className="mt-6 flex items-center justify-between gap-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <span>{t('states.error')}</span>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('states.retry')}
        </Button>
      </div>
    );
  }

  if (groupedItems.every((group) => group.items.length === 0)) {
    return (
      <div className="mt-6 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
        {t('states.empty')}
      </div>
    );
  }

  return (
    <div className={cn('mt-4', isDrilldown && 'relative pl-6')}>
      {isDrilldown ? (
        <div className="absolute top-0 bottom-0 left-2 w-px bg-neutral-200" />
      ) : null}
      {groupedItems.map(({ section, items }) => {
        if (items.length === 0) {
          return null;
        }

        return (
          <section key={section.key} className="mb-8">
            <h4 className="mb-4 text-sm font-bold tracking-wider text-gray-500 uppercase">
              {section.label}
            </h4>
            <div className="flex flex-col gap-4">
              {items.map((item, index) => (
                <AuditLogEventCard
                  key={`${getAuditLogHistoryItemKey(item)}:${index}`}
                  item={item}
                  allowDrilldown={!isDrilldown}
                  onOpenGroupLinkClick={onOpenGroupLinkClick}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AuditLogEventStreamSkeleton(props: { isDrilldown: boolean }) {
  const { isDrilldown } = props;

  return (
    <div
      className={cn('mt-4', isDrilldown && 'relative pl-6')}
      aria-hidden="true"
      {...skeletonListProps}
    >
      {isDrilldown ? (
        <div className="absolute top-0 bottom-0 left-2 w-px bg-neutral-200" />
      ) : null}
      <Skeleton className="mb-4 h-4 w-28 text-neutral-200" />
      <div className="flex flex-col gap-4">
        {Array.from(
          { length: AUDIT_LOG_EVENT_SKELETON_COUNT },
          (_event, index) => (
            <article
              key={index}
              className="rounded-md border border-neutral-200 bg-white shadow-sm"
            >
              <div className="flex gap-4 p-4">
                <Skeleton className="mt-1 size-3 shrink-0 rounded-full text-neutral-200" />
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Skeleton className="h-5 w-24 rounded-full text-neutral-200" />
                    <Skeleton className="h-5 w-16 rounded-full text-neutral-200" />
                    <Skeleton className="h-5 w-20 rounded-full text-neutral-200" />
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-5 w-3/5 text-neutral-200" />
                      <Skeleton className="mt-2 h-4 w-2/5 text-neutral-200" />
                    </div>
                    <Skeleton className="h-8 w-32 shrink-0 text-neutral-200" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
                    {Array.from({ length: 6 }, (_metadata, itemIndex) => (
                      <div key={itemIndex} className="flex flex-col gap-2">
                        <Skeleton className="h-3 w-20 text-neutral-200" />
                        <Skeleton className="h-4 w-28 text-neutral-200" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 overflow-hidden rounded-md border border-neutral-200">
                    <div className="grid grid-cols-[28%_36%_36%] bg-neutral-50">
                      <Skeleton className="m-3 h-3 text-neutral-200" />
                      <Skeleton className="m-3 h-3 text-neutral-200" />
                      <Skeleton className="m-3 h-3 text-neutral-200" />
                    </div>
                    {Array.from({ length: 2 }, (_row, rowIndex) => (
                      <div
                        key={rowIndex}
                        className="grid grid-cols-[28%_36%_36%] border-t border-neutral-200"
                      >
                        <Skeleton className="m-3 h-4 text-neutral-200" />
                        <Skeleton className="m-3 h-4 text-neutral-200" />
                        <Skeleton className="m-3 h-4 text-neutral-200" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ),
        )}
      </div>
    </div>
  );
}
