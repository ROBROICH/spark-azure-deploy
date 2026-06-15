import { z } from 'zod';

export const tocNoteSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  content: z.string(),
  isResolved: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TocNote = z.infer<typeof tocNoteSchema>;
