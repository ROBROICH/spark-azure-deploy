import { z } from 'zod';

/**
 * Schema for required documents structure (categories and document types)
 */
export const requiredDocumentSchema = z.object({
  projectId: z.string(),
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  isCategory: z.boolean(),
  origin: z.enum(['system', 'custom']).nullable(),
  isResolved: z.boolean(),
});

export type RequiredDocument = z.infer<typeof requiredDocumentSchema>;

/**
 * Recursive required-documents tree node used by the read/UI/editor layers
 * (categories carry `children`; leaf document types do not).
 */
export type RequiredDocumentNode = {
  id: string;
  name: string;
  isResolved?: boolean;
  children?: RequiredDocumentNode[];
};
