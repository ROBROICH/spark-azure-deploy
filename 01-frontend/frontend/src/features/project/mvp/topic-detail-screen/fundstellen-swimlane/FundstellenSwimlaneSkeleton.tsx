import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';

export const FundstellenSwimlaneSkeleton = () => {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-2">
        <div className="flex items-center gap-2 px-3 py-2">
          <Skeleton className="size-4 rounded-sm" aria-hidden />
          <Skeleton className="size-4 rounded-sm" aria-hidden />
          <Skeleton className="h-4 flex-1" aria-hidden />
          <Skeleton className="h-6 w-20 rounded-full" aria-hidden />
        </div>
      </div>
      <div className="flex flex-col gap-2 px-2 pb-2" {...skeletonListProps}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[8px] border border-border-primary p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-2/3" aria-hidden />
                <Skeleton className="h-4 w-full" aria-hidden />
                <Skeleton className="h-4 w-5/6" aria-hidden />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" aria-hidden />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex shrink-0 items-center justify-between border-t border-border-primary px-3 py-2">
        <Skeleton className="h-8 w-36 rounded-lg" aria-hidden />
        <Skeleton className="h-8 w-36 rounded-lg" aria-hidden />
      </div>
    </div>
  );
};
