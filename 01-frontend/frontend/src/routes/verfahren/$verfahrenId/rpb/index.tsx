import type { ExaminationDb } from '@/db/nodes/createExaminationDb';
import { preloadRpbRouteData } from '@/features/project/rpb/rpb.preload';
import { rpbSearchSchema } from '@/features/project/rpb/rpb.search';
import { RpbPage } from '@/features/project/rpb/RpbPage';
import { ProjectRouteSwimlaneSkeleton } from '@/features/project/skeletons/ProjectRouteSwimlaneSkeleton';
import { createFileRoute } from '@tanstack/react-router';

const loadRpbIndexRoute = async (loaderContext: {
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
  const loaderData = parentMatch.loaderData as
    | { db: ExaminationDb }
    | undefined;

  if (loaderData) {
    const search = rpbSearchSchema.parse(loaderContext.location.search);
    await preloadRpbRouteData(loaderData.db, search);
  }
};

export const Route = createFileRoute('/verfahren/$verfahrenId/rpb/')({
  component: RouteComponent,
  loader: loadRpbIndexRoute,
  pendingComponent: RpbPendingComponent,
  pendingMs: 0,
});

function RpbPendingComponent() {
  return <ProjectRouteSwimlaneSkeleton includeProjectShell={false} />;
}

function RouteComponent() {
  return <RpbPage />;
}
