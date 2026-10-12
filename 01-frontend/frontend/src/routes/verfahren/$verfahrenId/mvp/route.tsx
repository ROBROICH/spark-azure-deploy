import type { ExaminationDb } from '@/db/nodes/createExaminationDb';
import { redirectExcludedStepToEwms } from '@/features/project/route/productModeRedirect';
import { ProjectNavbar } from '@/features/project/route-navbar/ProjectNavbar';
import { ProjectNavbarSkeleton } from '@/features/project/route-navbar/ProjectNavbarSkeleton';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';

type ProjectRouteLoaderData = {
  db: ExaminationDb;
  projectVersion: number;
};

const loadMvpLayoutRoute = async (loaderContext: {
  parentMatchPromise: Promise<{ loaderData?: unknown }>;
}) => {
  const parentMatch = await loaderContext.parentMatchPromise;
  return parentMatch.loaderData as ProjectRouteLoaderData | undefined;
};

export const Route = createFileRoute('/verfahren/$verfahrenId/mvp')({
  beforeLoad: ({ params }) => {
    redirectExcludedStepToEwms(params.verfahrenId);
  },
  component: MvpLayout,
  loader: loadMvpLayoutRoute,
});

function MvpLayout() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip">
      <Suspense fallback={<ProjectNavbarSkeleton />}>
        <ProjectNavbar selectedStep="mvp" />
      </Suspense>
      <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-center overflow-x-clip">
        <Outlet />
      </main>
    </div>
  );
}
