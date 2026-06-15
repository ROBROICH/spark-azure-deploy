import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';

export const DocumentsSwimlaneSkeleton = () => {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-2 rounded-lg border border-border-primary p-2">
          <div className="flex items-center gap-2 px-1 py-1">
            <Skeleton className="size-4 rounded-sm" aria-hidden />
            <Skeleton className="size-4 rounded-sm" aria-hidden />
            <Skeleton className="h-4 flex-1" aria-hidden />
            <Skeleton className="h-6 w-24 rounded-full" aria-hidden />
          </div>
          <div className="space-y-2 pl-5" {...skeletonListProps}>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-2 py-1">
                <Skeleton className="size-4 rounded-sm" aria-hidden />
                <Skeleton className="h-4 flex-1" aria-hidden />
                <Skeleton className="h-6 w-16 rounded-full" aria-hidden />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
