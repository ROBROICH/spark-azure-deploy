import { Card } from '@/features/ui/card/Card';
import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import type { ReactNode } from 'react';

type ResultCardSkeletonProps = {
  statusAddon?: ReactNode;
};

export const ResultCardSkeleton = (props: ResultCardSkeletonProps) => {
  const { statusAddon } = props;

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden rounded-2xl bg-bg-secondary p-0 shadow-none">
      <div className="flex items-center gap-2 border-b border-border-secondary px-4 py-4">
        <Skeleton className="size-6 rounded-md" />
        <Skeleton className="h-3 w-48" />
        {statusAddon ? (
          <span className="ml-auto flex shrink-0">{statusAddon}</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <div className="mt-auto flex items-center justify-between">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-7 w-32" />
        </div>
      </div>
    </Card>
  );
};
