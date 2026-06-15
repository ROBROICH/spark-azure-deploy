import { DashboardScreen } from '@/features/main-page/dashboard-screen/DashboardScreen';
import { projectsTableSearchSchema } from '@/features/main-page/list-screen/projects-table/projectsTable.search';
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
  validateSearch: stateSchema,
});

function App() {
  return <DashboardScreen />;
}
