import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';

export const BeschlussSwimlaneSkeleton = () => {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
      <div className="space-y-4" {...skeletonListProps}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-border-primary p-3"
          >
            <div className="space-y-2">
              <Skeleton className="h-5 w-2/3" aria-hidden />
              <Skeleton className="h-4 w-full" aria-hidden />
              <Skeleton className="h-4 w-11/12" aria-hidden />
              <Skeleton className="h-4 w-5/6" aria-hidden />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
