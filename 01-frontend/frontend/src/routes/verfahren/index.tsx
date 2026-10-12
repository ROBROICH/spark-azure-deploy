import { CurrentUserLoadingScreen } from '@/features/access-control/current-user/CurrentUserProvider';
import { projectsTableSearchSchema } from '@/features/main-page/list-screen/projects-table/projectsTable.search';
import { loadProjectsOverviewRoute } from '@/features/main-page/route/projectsOverview.preload';
import { ListScreen } from '@/features/main-page/list-screen/ListScreen';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const searchSchema = projectsTableSearchSchema.extend({
  status: z.string().optional(),
});

export const Route = createFileRoute('/verfahren/')({
  component: RouteComponent,
  loader: loadProjectsOverviewRoute,
  pendingComponent: CurrentUserLoadingScreen,
  pendingMs: 0,
  validateSearch: searchSchema,
});

function RouteComponent() {
  return <ListScreen />;
}
