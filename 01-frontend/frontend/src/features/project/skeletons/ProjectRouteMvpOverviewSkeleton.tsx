import { ProjectNavbarSkeleton } from '@/features/project/route-navbar/ProjectNavbarSkeleton';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
} from '@/features/ui/sidebar/Sidebar';
import type { CSSProperties } from 'react';

const TopicCardSkeleton = () => {
  return (
    <div className="flex min-h-[264px] flex-col rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-6 w-2/3" aria-hidden />
        <Skeleton className="size-9 rounded-xl" aria-hidden />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Skeleton className="h-6 w-24 rounded-full" aria-hidden />
        <Skeleton className="h-6 w-20 rounded-full" aria-hidden />
      </div>
      <div className="mt-6 space-y-3" {...skeletonListProps}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={index}
            className={index === 3 ? 'h-4 w-2/3' : 'h-4 w-full'}
            aria-hidden
          />
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between pt-6">
        <Skeleton className="h-8 w-28 rounded-full" aria-hidden />
        <Skeleton className="h-8 w-24 rounded-full" aria-hidden />
      </div>
    </div>
  );
};

type ProjectRouteMvpOverviewSkeletonProps = {
  includeProjectShell?: boolean;
};

const MvpOverviewSkeletonContent = () => {
  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto bg-white px-32 py-8">
      <div className="mx-auto flex w-full max-w-container flex-col gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-lg" aria-hidden />
          <Skeleton className="h-6 w-72" aria-hidden />
          <Skeleton className="ml-auto h-8 w-28 rounded-full" aria-hidden />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Skeleton
            className="h-10 max-w-[540px] min-w-[280px] flex-1"
            aria-hidden
          />
          <div className="ml-auto flex items-center gap-4">
            <Skeleton className="h-9 w-28 rounded-full" aria-hidden />
            <Skeleton className="h-9 w-28 rounded-full" aria-hidden />
            <Skeleton className="h-9 w-32 rounded-full" aria-hidden />
            <Skeleton className="size-9 rounded-xl" aria-hidden />
          </div>
        </div>

        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 xl:grid-cols-4"
          {...skeletonListProps}
        >
          {Array.from({ length: 8 }).map((_, index) => (
            <TopicCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  );
};

export const ProjectRouteMvpOverviewSkeleton = (
  props: ProjectRouteMvpOverviewSkeletonProps,
) => {
  const { includeProjectShell = true } = props;

  if (!includeProjectShell) {
    return <MvpOverviewSkeletonContent />;
  }

  return (
    <SidebarProvider
      defaultOpen={false}
      className="min-h-0 min-w-0 flex-1"
      style={
        {
          '--sidebar-width': '14rem',
          '--sidebar-width-icon': '3rem',
        } as CSSProperties
      }
    >
      <SidebarInset className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto">
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip">
          <ProjectNavbarSkeleton />
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-center overflow-x-clip">
            <MvpOverviewSkeletonContent />
          </div>
        </div>
      </SidebarInset>
      <Sidebar
        side="right"
        collapsible="icon"
        expandDirection="right-to-left"
        className="z-40"
      >
        <SidebarContent className="overflow-hidden p-2">
          <div className="space-y-2">
            <Skeleton className="h-9 w-full rounded-lg" aria-hidden />
            <Skeleton className="h-9 w-full rounded-lg" aria-hidden />
            <Skeleton className="h-9 w-full rounded-lg" aria-hidden />
            <Skeleton className="h-9 w-full rounded-lg" aria-hidden />
            <Skeleton className="h-9 w-full rounded-lg" aria-hidden />
          </div>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
};
