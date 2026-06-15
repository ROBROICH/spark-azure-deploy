import type { ExaminationDb } from '@/db/nodes/createExaminationDb';
import { preloadMvpTopicRouteData } from '@/features/project/mvp/mvp.preload';
import { TopicDetailScreen } from '@/features/project/mvp/topic-detail-screen/TopicDetailScreen';
import { ProjectRouteSwimlaneSkeleton } from '@/features/project/skeletons/ProjectRouteSwimlaneSkeleton';
import { mvpSearchSchema } from '@/features/project/mvp/topic-detail-screen/mvp.search';
import { createFileRoute } from '@tanstack/react-router';

const loadMvpTopicRoute = async (loaderContext: {
  context: { previousLocation?: unknown };
  cause: string;
  location: { search: unknown };
  params: { topicName: string };
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
    const search = mvpSearchSchema.parse(loaderContext.location.search);
    await preloadMvpTopicRouteData(
      loaderData.db,
      loaderContext.params.topicName,
      search,
    );
  }
};

export const Route = createFileRoute('/verfahren/$verfahrenId/mvp/$topicName/')(
  {
    component: MvpTopicPage,
    loader: loadMvpTopicRoute,
    pendingComponent: MvpTopicPendingComponent,
    pendingMs: 0,
    validateSearch: mvpSearchSchema,
  },
);

function MvpTopicPendingComponent() {
  return (
    <ProjectRouteSwimlaneSkeleton showTopicHeader includeProjectShell={false} />
  );
}

function MvpTopicPage() {
  return <TopicDetailScreen />;
}
