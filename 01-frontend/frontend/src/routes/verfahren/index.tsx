import { projectsTableSearchSchema } from '@/features/main-page/list-screen/projects-table/projectsTable.search';
import { ListScreen } from '@/features/main-page/list-screen/ListScreen';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const searchSchema = projectsTableSearchSchema.extend({
  status: z.string().optional(),
});

export const Route = createFileRoute('/verfahren/')({
  component: RouteComponent,
  validateSearch: searchSchema,
});

function RouteComponent() {
  return <ListScreen />;
}
