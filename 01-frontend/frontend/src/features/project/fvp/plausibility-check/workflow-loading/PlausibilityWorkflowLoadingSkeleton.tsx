import { Card, CardContent } from '@/features/ui/card/Card';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';

const ContradictionsToolbarSkeleton = () => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="size-4 rounded-full" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 max-w-[28.625rem] min-w-[18rem] flex-[0_1_28.625rem]" />
        <div className="ml-auto flex items-center justify-end gap-2">
          <Skeleton className="h-8 w-[18rem]" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>
      </div>
    </div>
  );
};

export const PlausibilityWorkflowLoadingSkeleton = () => {
  return (
    <div className="mx-auto flex w-full max-w-container flex-1 items-start gap-4 p-6 pt-8">
      <div className="flex flex-1 flex-col gap-4" {...skeletonListProps}>
        <ContradictionsToolbarSkeleton />

        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} className="bg-neutral-white px-4 py-3">
            <CardContent className="flex items-center gap-3 p-0">
              <Skeleton className="h-5 w-5" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-6 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
