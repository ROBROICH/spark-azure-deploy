import { ProjectNavbarSkeleton } from '@/features/project/route-navbar/ProjectNavbarSkeleton';
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
} from '@/features/ui/sidebar/Sidebar';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import type { CSSProperties } from 'react';

const ProjectHeaderSkeleton = () => (
  <div className="flex items-center gap-4">
    <Skeleton className="size-12 shrink-0 rounded-xl" aria-hidden />
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Skeleton className="h-6 w-2/3" aria-hidden />
      <Skeleton className="h-5 w-1/4" aria-hidden />
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <Skeleton className="h-8 w-44 rounded-lg" aria-hidden />
      <Skeleton className="size-8 rounded-lg" aria-hidden />
      <Skeleton className="size-8 rounded-lg" aria-hidden />
    </div>
  </div>
);

const CollapsibleSectionSkeleton = () => (
  <div className="flex items-center gap-2 rounded-2xl bg-bg-secondary p-2">
    <Skeleton className="size-8 shrink-0 rounded-lg" aria-hidden />
    <Skeleton className="h-5 flex-1" aria-hidden />
    <Skeleton className="size-6 shrink-0 rounded" aria-hidden />
  </div>
);

const DeadlinesSkeleton = () => (
  <div className="flex flex-col gap-4 px-2">
    <div className="flex items-center gap-2">
      <Skeleton className="size-8 shrink-0 rounded-lg" aria-hidden />
      <Skeleton className="h-5 flex-1" aria-hidden />
      <Skeleton className="h-8 w-28 shrink-0 rounded-lg" aria-hidden />
    </div>
    <div
      className="overflow-hidden rounded-lg border border-border-primary"
      {...skeletonListProps}
    >
      <div className="flex border-b border-border-primary bg-bg-secondary">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-1 px-2 py-[11px]">
            <Skeleton className="h-[18px] w-16" aria-hidden />
          </div>
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex border-b border-border-primary last:border-b-0"
        >
          {Array.from({ length: 5 }).map((_cell, j) => (
            <div key={j} className="flex-1 px-2 py-[11px]">
              <Skeleton className="h-[18px] w-20" aria-hidden />
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

const DocumentsSkeleton = () => (
  <div className="flex flex-col gap-4 px-2">
    <div className="flex items-center gap-2">
      <Skeleton className="size-8 shrink-0 rounded-lg" aria-hidden />
      <Skeleton className="h-5 flex-1" aria-hidden />
    </div>
    <div className="flex items-center gap-4">
      <Skeleton className="h-8 w-64 rounded-lg" aria-hidden />
    </div>
    <div className="overflow-hidden rounded-lg border border-border-primary">
      <div className="flex border-b border-border-primary bg-bg-secondary">
        <div className="flex-1 px-2 py-[11px]">
          <Skeleton className="h-[18px] w-20" aria-hidden />
        </div>
        <div className="w-44 px-2 py-[11px]">
          <Skeleton className="h-[18px] w-24" aria-hidden />
        </div>
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center border-b border-border-primary bg-neutral-white last:border-b-0"
        >
          <div className="flex flex-1 items-center gap-2 px-2 py-[11px]">
            <Skeleton className="size-6 shrink-0 rounded" aria-hidden />
            <Skeleton className="h-[18px] flex-1" aria-hidden />
          </div>
          <div className="w-44 px-2 py-[11px]">
            <Skeleton className="h-[18px] w-28" aria-hidden />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const ProjectRouteSingleProjectSkeleton = () => {
  return (
    <div className="bg-secondary flex h-screen min-h-screen flex-col">
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
        <SidebarInset className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto bg-neutral-white">
          <ProjectNavbarSkeleton />
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-center overflow-x-clip">
            <div className="flex w-full max-w-container-sm min-w-0 flex-1 flex-col gap-6 overflow-x-clip p-8">
              <ProjectHeaderSkeleton />
              <CollapsibleSectionSkeleton />
              <DeadlinesSkeleton />
              <DocumentsSkeleton />
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
    </div>
  );
};
