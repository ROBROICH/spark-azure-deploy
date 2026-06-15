import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { RpbOverviewItemRow } from '../shared/ItemRow';

export const AiTopicNormRowSkeleton = () => {
  return (
    <RpbOverviewItemRow showChevron>
      <Skeleton className="h-4 flex-1" aria-hidden />
      <Skeleton className="h-6 w-10 rounded-full" aria-hidden />
      <Skeleton className="size-6 rounded-md" aria-hidden />
    </RpbOverviewItemRow>
  );
};
