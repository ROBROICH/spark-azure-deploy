import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';

export const OutlineSwimlaneSkeleton = () => {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2" {...skeletonListProps}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="rounded-lg border border-border-primary bg-bg-secondary p-3"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="size-4 rounded-sm" aria-hidden />
                <Skeleton className="h-4 flex-1" aria-hidden />
                <Skeleton className="h-6 w-14 rounded-full" aria-hidden />
              </div>
              {index < 3 ? (
                <div className="mt-3 space-y-2 pl-5" {...skeletonListProps}>
                  {Array.from({ length: 2 }).map((__, childIndex) => (
                    <div key={childIndex} className="flex items-center gap-2">
                      <Skeleton className="size-4 rounded-sm" aria-hidden />
                      <Skeleton className="h-4 flex-1" aria-hidden />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border-primary p-3">
        <Skeleton className="h-10 w-full rounded-lg" aria-hidden />
      </div>
    </div>
  );
};
