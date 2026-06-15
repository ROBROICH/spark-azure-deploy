import { Card, CardContent, CardHeader } from '@/features/ui/card/Card';
import { Skeleton } from '@/features/ui/skeleton/Skeleton';

export const FavoriteCardSkeleton = () => (
  <Card className="h-[230px] gap-0 overflow-hidden rounded-lg border-none bg-bg-secondary py-4 pt-0 shadow-none">
    <Skeleton className="h-12 w-full rounded-none" aria-hidden />

    <div className="relative -mt-12 flex h-12 w-full items-center justify-between p-2">
      <Skeleton className="size-8 rounded-lg" aria-hidden />
      <Skeleton className="h-6 w-16 rounded-sm" aria-hidden />
    </div>

    <div className="flex flex-col justify-between">
      <CardHeader className="p-4 pb-0">
        <Skeleton className="h-5 w-3/4" aria-hidden />
        <Skeleton className="mt-1 h-3.5 w-1/2" aria-hidden />
      </CardHeader>

      <hr className="mx-4 my-4 border-t-[0.5px] border-border-primary" />

      <CardContent className="flex flex-col gap-2 px-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-3 rounded-sm" aria-hidden />
          <Skeleton className="h-3.5 w-24" aria-hidden />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="size-3 rounded-sm" aria-hidden />
          <Skeleton className="h-3.5 w-20" aria-hidden />
        </div>
      </CardContent>
    </div>
  </Card>
);
