import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { SwimlaneHeaderPortal } from '@/features/ui/swimlanes/SwimlaneHeaderPortal';
import { getRouteApi } from '@tanstack/react-router';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

type AiAssistanceSwimlaneSkeletonProps = {
  showHeader?: boolean;
};

/**
 * Mirrors the active route branch while suspended so header affordances do not
 * jump between overview, norm detail, and sentence detail loading states.
 */
export const AiAssistanceSwimlaneSkeleton = (
  props: AiAssistanceSwimlaneSkeletonProps,
) => {
  const { showHeader = true } = props;
  const { topicNormId, satzId, rechtsmethodikSatzId } = route.useSearch({
    select: (search) => ({
      rechtsmethodikSatzId: search.rechtsmethodikSatzId,
      satzId: search.satzId,
      topicNormId: search.topicNormId,
    }),
  });
  const isNormDetail = Boolean(topicNormId) && !satzId && !rechtsmethodikSatzId;
  const isSatzDetail = Boolean(satzId || rechtsmethodikSatzId);

  return (
    <>
      {showHeader ? (
        <SwimlaneHeaderPortal>
          {topicNormId ? (
            <Skeleton className="size-8 rounded-md" aria-hidden />
          ) : null}
          <Skeleton className="h-4 w-32" aria-hidden />
          <div className="flex shrink-0 items-center gap-2">
            {!topicNormId && !isSatzDetail ? (
              <Skeleton className="h-9 w-40 rounded-md" aria-hidden />
            ) : null}
            {isNormDetail || isSatzDetail ? (
              <Skeleton className="h-8 w-24 rounded-md" aria-hidden />
            ) : null}
          </div>
        </SwimlaneHeaderPortal>
      ) : null}

      <div
        className={
          topicNormId
            ? 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6'
            : 'flex min-h-0 flex-1 flex-col overflow-y-auto p-5 pt-2'
        }
        {...skeletonListProps}
      >
        {isSatzDetail ? (
          <div className="flex flex-col gap-2 p-2">
            <div className="space-y-3 rounded-lg border border-border-primary p-4">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-40" aria-hidden />
                <Skeleton className="h-6 w-28 rounded-md" aria-hidden />
              </div>
              <Skeleton className="h-4 w-full" aria-hidden />
              <Skeleton className="h-4 w-11/12" aria-hidden />
              <Skeleton className="h-4 w-10/12" aria-hidden />
            </div>
          </div>
        ) : topicNormId ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-3">
              {index > 0 ? <hr className="border-border-primary" /> : null}
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-56" aria-hidden />
                <div className="flex items-center gap-2">
                  <Skeleton className="size-9 rounded-md" aria-hidden />
                  <Skeleton className="size-9 rounded-md" aria-hidden />
                </div>
              </div>
              <Skeleton className="h-20 w-full rounded-lg" aria-hidden />
            </div>
          ))
        ) : (
          <div className="space-y-3 pt-2" {...skeletonListProps}>
            {Array.from({ length: 3 }).map((_, sectionIndex) => (
              <div
                key={sectionIndex}
                className="rounded-lg border border-border-primary p-3"
              >
                <div className="flex items-center gap-2">
                  <Skeleton className="size-4 rounded-sm" aria-hidden />
                  <Skeleton className="h-4 flex-1" aria-hidden />
                  <Skeleton className="h-6 w-12 rounded-full" aria-hidden />
                </div>
                <div className="mt-3 space-y-2 pl-2" {...skeletonListProps}>
                  {Array.from({ length: 3 }).map((__, itemIndex) => (
                    <div key={itemIndex} className="flex items-center gap-2">
                      <Skeleton className="h-4 flex-1" aria-hidden />
                      <Skeleton className="h-6 w-10 rounded-full" aria-hidden />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
