import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';

export const DeadlinesCardSkeleton = () => (
  <div className="mt-6 flex flex-col gap-4 p-2">
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="size-8 shrink-0 rounded-lg" aria-hidden />
      <Skeleton className="h-5 flex-1" aria-hidden />
      <Skeleton className="h-8 w-28 rounded-lg" aria-hidden />
    </div>
    <div
      className="overflow-clip rounded-lg border border-border-primary"
      {...skeletonListProps}
    >
      <div className="flex border-b border-border-primary bg-bg-secondary">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-1 px-3 py-[11px]">
            <Skeleton className="h-[18px] w-16" aria-hidden />
          </div>
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex border-b border-border-primary last:border-b-0"
        >
          {Array.from({ length: 5 }).map((_cell, j) => (
            <div key={j} className="flex-1 px-3 py-[11px]">
              <Skeleton className="h-[18px] w-20" aria-hidden />
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);
