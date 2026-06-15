import { ProjectRouteMvpOverviewSkeleton } from '@/features/project/skeletons/ProjectRouteMvpOverviewSkeleton';
import { TopicsOverviewScreen } from '@/features/project/mvp/overview-screen/TopicsOverviewScreen';
import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { z } from 'zod';

const searchSchema = z.object({
  isStartFvpRunDialogOpen: z.boolean().optional(),
  search: z.string().optional(),
  topicAssigneeIds: z.array(z.string()).catch([]).optional(),
  topicSort: z.enum(['titleAsc', 'titleDesc']).optional(),
  topicStatus: z.enum(['open', 'inProgress', 'complete']).optional(),
});

function MvpTopicsPage() {
  return (
    <Suspense
      fallback={<ProjectRouteMvpOverviewSkeleton includeProjectShell={false} />}
    >
      <TopicsOverviewScreen />
    </Suspense>
  );
}

export const Route = createFileRoute('/verfahren/$verfahrenId/mvp/')({
  component: MvpTopicsPage,
  validateSearch: searchSchema,
});
