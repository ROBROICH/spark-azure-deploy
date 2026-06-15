import { ProjectNavbarSkeleton } from '@/features/project/route-navbar/ProjectNavbarSkeleton';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
} from '@/features/ui/sidebar/Sidebar';
import type { CSSProperties } from 'react';

type ProjectRouteSwimlaneSkeletonProps = {
  includeProjectShell?: boolean;
  showTopicHeader?: boolean;
};

const SkeletonLaneHeader = () => {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-primary px-4 py-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-5 rounded" aria-hidden />
        <Skeleton className="h-5 w-28" aria-hidden />
      </div>
      <Skeleton className="size-8 rounded-lg" aria-hidden />
    </div>
  );
};

const DocumentsLaneSkeleton = () => {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-b border-border-primary px-4 py-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-full" aria-hidden />
          <Skeleton className="h-8 w-28 rounded-full" aria-hidden />
        </div>
      </div>
      <div
        className="min-h-0 flex-1 space-y-4 overflow-auto p-4"
        {...skeletonListProps}
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-border-primary p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Skeleton className="mt-1 size-4 rounded-sm" aria-hidden />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-5/6" aria-hidden />
                  <Skeleton className="h-4 w-2/3" aria-hidden />
                </div>
              </div>
              <Skeleton className="h-7 w-20 rounded-full" aria-hidden />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PdfLaneSkeleton = () => {
  return (
    <div className="flex min-h-0 min-w-0 flex-[1.1] flex-col">
      <SkeletonLaneHeader />
      <div className="min-h-0 flex-1 p-4">
        <div className="flex h-full min-h-[24rem] flex-col rounded-xl border border-border-primary bg-neutral-50 p-4">
          <div className="flex items-center justify-between gap-3 border-b border-border-primary pb-4">
            <Skeleton className="h-4 w-40" aria-hidden />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-lg" aria-hidden />
              <Skeleton className="h-8 w-8 rounded-lg" aria-hidden />
              <Skeleton className="h-8 w-20 rounded-lg" aria-hidden />
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center p-6">
            <Skeleton className="h-full w-full rounded-lg" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
};

const SideLaneSkeleton = () => {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SkeletonLaneHeader />
      <div
        className="min-h-0 flex-1 space-y-4 overflow-auto p-4"
        {...skeletonListProps}
      >
        <Skeleton className="h-24 w-full rounded-xl" aria-hidden />
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-border-primary p-4"
          >
            <div className="space-y-3">
              <Skeleton className="h-5 w-2/3" aria-hidden />
              <Skeleton className="h-4 w-full" aria-hidden />
              <Skeleton className="h-4 w-5/6" aria-hidden />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Skeleton className="h-6 w-24 rounded-full" aria-hidden />
              <Skeleton className="h-6 w-16 rounded-full" aria-hidden />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ProjectRouteSwimlaneSkeleton = (
  props: ProjectRouteSwimlaneSkeletonProps,
) => {
  const { showTopicHeader = false, includeProjectShell = true } = props;

  const swimlaneContent = (
    <div className="flex h-full min-h-0 w-full flex-1 self-stretch">
      <div className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden border border-border-primary bg-neutral-white">
        {showTopicHeader ? (
          <div className="flex items-center justify-between gap-4 border-b border-border-primary px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-28 rounded-lg" aria-hidden />
              <div className="space-y-2">
                <Skeleton className="h-5 w-56" aria-hidden />
                <Skeleton className="h-4 w-32" aria-hidden />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-full" aria-hidden />
              <Skeleton className="size-8 rounded-lg" aria-hidden />
            </div>
          </div>
        ) : null}

        <section className="min-h-0 flex-1 overflow-auto">
          <div className="flex min-h-full min-w-0 flex-col xl:flex-row xl:overflow-hidden xl:[&>*+*]:border-l xl:[&>*+*]:border-l-border-primary">
            <DocumentsLaneSkeleton />
            <PdfLaneSkeleton />
            <SideLaneSkeleton />
          </div>
        </section>
      </div>
    </div>
  );

  if (!includeProjectShell) {
    return swimlaneContent;
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
            {swimlaneContent}
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
