import { Skeleton } from '@/features/ui/skeleton/Skeleton';

export const BackButtonBarSkeleton = () => {
  return (
    <div className="flex items-center justify-between border-b border-border-primary bg-neutral-white px-2 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Skeleton className="size-8 rounded-lg" aria-hidden />
        <Skeleton className="h-6 w-40" aria-hidden />
      </div>
      <Skeleton className="h-6 w-32 rounded-full" aria-hidden />
    </div>
  );
};
