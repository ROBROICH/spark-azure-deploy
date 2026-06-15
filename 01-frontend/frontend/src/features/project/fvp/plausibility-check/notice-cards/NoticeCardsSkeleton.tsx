import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';

const SUMMARY_CARD_COUNT = 3;

export const NoticeCardsSkeleton = () => {
  return (
    <div
      className="grid grid-cols-1 gap-2 md:grid-cols-3"
      {...skeletonListProps}
    >
      {Array.from({ length: SUMMARY_CARD_COUNT }, (_, i) => (
        <div
          key={i}
          className="flex min-h-24 flex-1 flex-col items-center justify-center gap-2 rounded-xl border-[0.5px] border-slate-300 bg-white p-6"
        >
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
};
