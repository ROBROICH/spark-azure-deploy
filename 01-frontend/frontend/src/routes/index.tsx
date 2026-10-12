import { DashboardScreen } from '@/features/main-page/dashboard-screen/DashboardScreen';
import { CurrentUserLoadingScreen } from '@/features/access-control/current-user/CurrentUserProvider';
import { projectsTableSearchSchema } from '@/features/main-page/list-screen/projects-table/projectsTable.search';
import { loadProjectsOverviewRoute } from '@/features/main-page/route/projectsOverview.preload';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const stateSchema = projectsTableSearchSchema.extend({
  calendarDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  showAllFavorites: z.enum(['true']).optional(),
});

export const Route = createFileRoute('/')({
  component: App,
  loader: loadProjectsOverviewRoute,
  pendingComponent: CurrentUserLoadingScreen,
  pendingMs: 0,
  validateSearch: stateSchema,
});

function App() {
  return <DashboardScreen />;
}
