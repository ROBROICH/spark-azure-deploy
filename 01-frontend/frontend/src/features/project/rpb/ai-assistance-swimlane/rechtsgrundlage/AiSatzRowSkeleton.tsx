import { Skeleton } from '@/features/ui/skeleton/Skeleton';

type AiSatzRowSkeletonProps = {
  showDivider: boolean;
};

export const AiSatzRowSkeleton = (props: AiSatzRowSkeletonProps) => {
  const { showDivider } = props;

  return (
    <div className="w-full">
      {showDivider ? <hr className="my-2 border-border-primary" /> : null}
      <div className="flex w-full items-center justify-between gap-2 p-1">
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <Skeleton className="size-4 shrink-0 rounded-sm" aria-hidden />
          <Skeleton className="h-4 w-28 shrink-0" aria-hidden />
          <Skeleton className="size-4 shrink-0 rounded-sm" aria-hidden />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="size-6" />
          <Skeleton className="size-8 rounded-md" aria-hidden />
          <Skeleton className="h-8 w-14 rounded-md" aria-hidden />
        </div>
      </div>
      <div className="px-1 pb-1">
        <Skeleton className="h-4 w-full" aria-hidden />
      </div>
    </div>
  );
};
