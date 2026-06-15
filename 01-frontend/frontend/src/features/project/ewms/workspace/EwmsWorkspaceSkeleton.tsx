import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { useTranslation } from 'react-i18next';

const SkeletonLaneHeader = () => {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-5 rounded" aria-hidden />
        <Skeleton className="h-5 w-28" aria-hidden />
      </div>
      <Skeleton className="size-8 rounded-lg" aria-hidden />
    </div>
  );
};

const ObjectionsLaneSkeleton = () => {
  return (
    <div className="flex min-h-0 min-w-0 flex-[0.95] flex-col">
      <SkeletonLaneHeader />
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-full" aria-hidden />
          <Skeleton className="h-8 w-16 rounded-full" aria-hidden />
          <Skeleton className="h-8 w-20 rounded-full" aria-hidden />
        </div>
      </div>
      <div
        className="min-h-0 flex-1 space-y-3 overflow-auto p-4"
        {...skeletonListProps}
      >
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-4/5" aria-hidden />
                <Skeleton className="h-3 w-3/5" aria-hidden />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" aria-hidden />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DocumentLaneSkeleton = () => {
  return (
    <div className="flex min-h-0 min-w-0 flex-[1.1] flex-col">
      <SkeletonLaneHeader />
      <div className="min-h-0 flex-1 p-4">
        <div className="flex h-full min-h-[24rem] flex-col rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <Skeleton className="h-4 w-44" aria-hidden />
            <div className="flex items-center gap-2">
              <Skeleton className="size-8 rounded-lg" aria-hidden />
              <Skeleton className="size-8 rounded-lg" aria-hidden />
              <Skeleton className="h-8 w-20 rounded-lg" aria-hidden />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-5">
            <Skeleton className="h-full min-h-[18rem] w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
};

const ArgumentsLaneSkeleton = () => {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SkeletonLaneHeader />
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-8 w-32 rounded-lg" aria-hidden />
          <Skeleton className="h-8 w-24 rounded-full" aria-hidden />
        </div>
      </div>
      <div
        className="min-h-0 flex-1 space-y-4 overflow-auto p-4"
        {...skeletonListProps}
      >
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="space-y-3">
              <Skeleton className="h-4 w-2/3" aria-hidden />
              <Skeleton className="h-4 w-full" aria-hidden />
              <Skeleton className="h-4 w-5/6" aria-hidden />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Skeleton className="h-6 w-24 rounded-full" aria-hidden />
              <Skeleton className="h-6 w-20 rounded-full" aria-hidden />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const EwmsWorkspaceSkeleton = () => {
  const { t } = useTranslation('Ewms');

  return (
    <div
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col bg-white"
      role="status"
      aria-label={t('loadingPage.statusCheckLabel')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white p-2 sm:flex-nowrap sm:py-0 sm:pr-2 sm:pl-0">
        <div className="flex min-w-0 items-center">
          <Skeleton className="h-12 w-28 rounded-none" aria-hidden />
          <Skeleton className="h-12 w-28 rounded-none" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
          <Skeleton className="h-7 w-40 rounded-lg" aria-hidden />
          <Skeleton className="h-8 w-32 rounded-lg" aria-hidden />
          <Skeleton className="h-8 w-24 rounded-lg" aria-hidden />
        </div>
      </div>

      <section className="min-h-0 flex-1 overflow-auto">
        <div className="flex min-h-full min-w-0 flex-col xl:flex-row xl:overflow-hidden xl:[&>*+*]:border-l xl:[&>*+*]:border-l-slate-200">
          <ObjectionsLaneSkeleton />
          <DocumentLaneSkeleton />
          <ArgumentsLaneSkeleton />
        </div>
      </section>
    </div>
  );
};
