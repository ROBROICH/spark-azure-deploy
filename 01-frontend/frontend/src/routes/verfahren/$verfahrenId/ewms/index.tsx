import { preloadEwmsRouteData } from '@/features/project/ewms/ewms.preload';
import { ewmsSearchSchema } from '@/features/project/ewms/ewms.search';
import { EwmsPage } from '@/features/project/ewms/EwmsPage';
import { EwmsWorkspaceSkeleton } from '@/features/project/ewms/workspace/EwmsWorkspaceSkeleton';
import { ProjectNavbar } from '@/features/project/route-navbar/ProjectNavbar';
import { ProjectNavbarSkeleton } from '@/features/project/route-navbar/ProjectNavbarSkeleton';
import type { ExaminationDb } from '@/db/nodes/createExaminationDb';
import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';

type EwmsParentLoaderData = {
  db: ExaminationDb;
  workflowsManager: {
    refetchRunning: () => Promise<unknown>;
  };
};

const loadEwmsRoute = async (loaderContext: {
  context: { previousLocation?: unknown };
  cause: string;
  location: { search: unknown };
  parentMatchPromise: Promise<{ loaderData?: unknown }>;
  preload: boolean;
}) => {
  if (
    loaderContext.preload ||
    loaderContext.cause !== 'enter' ||
    loaderContext.context.previousLocation
  ) {
    return;
  }

  const parentMatch = await loaderContext.parentMatchPromise;
  const loaderData = parentMatch.loaderData as EwmsParentLoaderData | undefined;

  if (loaderData) {
    const search = ewmsSearchSchema.parse(loaderContext.location.search);
    await Promise.all([
      preloadEwmsRouteData(loaderData.db, search),
      loaderData.workflowsManager.refetchRunning().catch(() => undefined),
    ]);
  }
};

export const Route = createFileRoute('/verfahren/$verfahrenId/ewms/')({
  component: RouteComponent,
  loader: loadEwmsRoute,
  pendingComponent: EwmsPendingComponent,
  pendingMs: 0,
  validateSearch: ewmsSearchSchema,
});

function EwmsPendingComponent() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip">
      <ProjectNavbarSkeleton />
      <EwmsWorkspaceSkeleton />
    </div>
  );
}

function RouteComponent() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip">
      <Suspense fallback={<ProjectNavbarSkeleton />}>
        <ProjectNavbar selectedStep="ewms" />
      </Suspense>
      <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip">
        <EwmsPage />
      </main>
    </div>
  );
}
