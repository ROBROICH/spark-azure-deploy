import { z } from 'zod';

export const plausibilityCheckSearchSchema = z.object({
  search: z.string().catch('').optional(),
  statusFilter: z.string().optional(),
  documentFilter: z.string().optional(),
  expandedContradictionId: z.string().optional(),
  previewDocumentId: z.string().optional(),
  previewPageNumber: z.number().optional(),
  leftOccurrenceIndex: z.number().optional(),
  rightOccurrenceIndex: z.number().optional(),
});
