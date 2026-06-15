import { SingleProject } from '@/features/project/overview-screen/SingleProject';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const searchSchema = z.object({
  search: z.string().catch('').optional(),
  previewDocumentId: z.string().optional(),
  showStartProcessDialog: z.boolean().optional(),
  detailsOpen: z.boolean().optional(),
  editDeadlineId: z.string().optional(),
  documentVersion: z.number().int().positive().optional().catch(undefined),
});

export const Route = createFileRoute('/verfahren/$verfahrenId/')({
  component: RouteComponent,
  validateSearch: searchSchema,
});

function RouteComponent() {
  return <SingleProject />;
}
