import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';

export const RechtsgrundlageSwimlaneSkeleton = () => {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-3" {...skeletonListProps}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-lg border border-border-primary p-2"
            >
              <div className="flex items-center gap-2 py-2">
                <Skeleton className="size-4 rounded-sm" aria-hidden />
                <Skeleton className="h-4 flex-1" aria-hidden />
                <Skeleton className="h-6 w-24 rounded-full" aria-hidden />
              </div>
              <div
                className="grid grid-cols-2 gap-2 pt-2"
                {...skeletonListProps}
              >
                {Array.from({ length: 4 }).map((__, cardIndex) => (
                  <div
                    key={cardIndex}
                    className="rounded-lg border border-border-primary p-3"
                  >
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-3/4" aria-hidden />
                      <Skeleton className="h-4 w-full" aria-hidden />
                      <Skeleton className="h-8 w-full rounded-lg" aria-hidden />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
