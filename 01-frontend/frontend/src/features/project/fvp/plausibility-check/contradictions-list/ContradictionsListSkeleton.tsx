import { Card } from '@/features/ui/card/Card';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';

const SKELETON_CARD_COUNT = 5;

export const ContradictionsListSkeleton = () => {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-2" {...skeletonListProps}>
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => (
          <Card key={i} className="px-4 py-2">
            <div className="flex items-center gap-3">
              <Skeleton className="size-5 shrink-0" />
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-7 w-24 rounded-full" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
