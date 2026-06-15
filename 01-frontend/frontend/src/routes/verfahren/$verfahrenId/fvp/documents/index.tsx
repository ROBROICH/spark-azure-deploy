import { FvpScreen } from '@/features/project/fvp/main-screen/FvpScreen';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const stateSchema = z.object({
  search: z.string().catch('').optional(),
  previewDocumentId: z.string().optional(),
  documentTypeFilter: z.string().optional(),
  statusFilter: z.string().optional(),
  allCollapsed: z.boolean().optional(),
  isEditRequiredDocumentsDialogOpen: z.boolean().optional(),
  isStartFvpRunDialogOpen: z.boolean().optional(),
});

export const Route = createFileRoute('/verfahren/$verfahrenId/fvp/documents/')({
  component: FvpScreen,
  validateSearch: stateSchema,
});
