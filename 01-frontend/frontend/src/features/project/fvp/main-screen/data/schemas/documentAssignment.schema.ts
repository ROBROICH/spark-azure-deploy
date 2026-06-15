import { z } from 'zod';

export const documentAssignmentSchema = z.object({
  projectId: z.string(),
  documentId: z.string(),
  aiSuggestedDocumentTypeId: z.string().nullable(),
  humanRequiredDocumentTypeId: z.string().nullable(),
  documentTypeId: z.string().nullable(),
  documentTypeName: z.string().nullable(),
  isResolved: z.boolean(),
});

export type DocumentAssignment = z.infer<typeof documentAssignmentSchema>;
