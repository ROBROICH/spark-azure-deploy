import { Skeleton } from '@/features/ui/skeleton/Skeleton';

export const ProjectNavbarSkeleton = () => {
  return (
    <div className="border-b border-neutral-200 bg-neutral-100">
      <div className="p-2">
        <div className="flex flex-col gap-2 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-4">
          <div className="justify-self-start">
            <Skeleton className="h-9 w-32 rounded-lg" aria-hidden />
          </div>

          <h1 className="order-first text-center md:order-none">
            <Skeleton className="mx-auto h-3 w-40 rounded" aria-hidden />
          </h1>

          <div className="justify-self-end">
            <div className="flex items-center gap-2">
              <Skeleton className="size-8 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-40 rounded" aria-hidden />
                <Skeleton className="h-3 w-24 rounded" aria-hidden />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
